import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const apiBase = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`
const categories = ['laboratory', 'IT', 'sports', 'facilities', 'event_equipment']

function ResourcePhoto({ resource, onError }) {
  const [photoUrl, setPhotoUrl] = useState('')

  useEffect(() => {
    if (!resource.photo_path) return undefined
    let active = true
    api(`/resources/${resource.id}/photo`)
      .then((response) => { if (active) setPhotoUrl(response.url) })
      .catch((requestError) => {
        if (!active) return
        if (requestError.status !== 404) onError(requestError.message)
        setPhotoUrl('')
      })
    return () => { active = false }
  }, [onError, resource.id, resource.photo_path])

  return photoUrl ? <img className="resource-photo" src={photoUrl} alt={`${resource.name} resource`} /> : null
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return null
  const body = await response.json()
  if (!response.ok) {
    const requestError = new Error(body.message || `Request failed (${response.status})`)
    requestError.status = response.status
    throw requestError
  }
  return body
}

function localDateTime(hoursFromNow) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function App() {
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authMessage, setAuthMessage] = useState('')
  const [authForm, setAuthForm] = useState({ full_name: '', email: '', password: '', department: '', student_year: '' })
  const [resources, setResources] = useState([])
  const [bookings, setBookings] = useState([])
  const [timeline, setTimeline] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [adminIncidents, setAdminIncidents] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [availabilityStart, setAvailabilityStart] = useState('')
  const [availabilityEnd, setAvailabilityEnd] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('resources')
  const [requestingResource, setRequestingResource] = useState(null)
  const [requestForm, setRequestForm] = useState({ start_at: localDateTime(24), end_at: localDateTime(26), purpose: '' })
  const [resourceForm, setResourceForm] = useState({
    name: '', asset_code: '', description: '', category: 'IT', resource_type: 'equipment',
    location: '', department: '', institution: '', approval_mode: 'manual',
    handover_mode: 'staff_attended', restricted: false, usage_terms: '',
    allowed_departments: '', minimum_year: '', required_training: '', available_from: '', available_until: '',
  })
  const [incidentForm, setIncidentForm] = useState({ booking_id: '', resource_id: '', kind: 'damage', description: '' })
  const isAdmin = user?.role === 'administrator'
  const canManageBooking = (booking) => isAdmin || booking.resources?.created_by === user?.id
  const canCompleteHandover = (booking) => (
    isAdmin
    || booking.resources?.created_by === user?.id
    || (booking.student_id === user?.id && booking.resources?.handover_mode === 'self_service')
  )

  const loadResources = useCallback(async () => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (category) params.set('category', category)
    if (location.trim()) params.set('location', location.trim())
    if (resourceType) params.set('resource_type', resourceType)
    if (availabilityStart && availabilityEnd) {
      params.set('start_at', new Date(availabilityStart).toISOString())
      params.set('end_at', new Date(availabilityEnd).toISOString())
    }
    const response = await api(`/resources?${params}`)
    setResources(response.data)
  }, [availabilityEnd, availabilityStart, category, location, query, resourceType])

  const loadPrivateData = useCallback(async () => {
    if (!user) return
    const [bookingResult, timelineResult, dashboardResult, notificationResult] = await Promise.all([
      api('/bookings'),
      api('/timeline'),
      api('/dashboard'),
      api('/notifications'),
    ])
    setBookings(bookingResult.data)
    setTimeline(timelineResult.data)
    setDashboard(dashboardResult.data)
    setNotifications(notificationResult.data)
    if (isAdmin) {
      const [usersResult, incidentsResult] = await Promise.all([
        api('/admin/users'),
        api('/admin/incidents'),
      ])
      setAdminUsers(usersResult.data)
      setAdminIncidents(incidentsResult.data)
    } else {
      setAdminUsers([])
      setAdminIncidents([])
    }
  }, [isAdmin, user])

  const refresh = useCallback(async () => {
    setError('')
    try {
      await Promise.all([loadResources(), loadPrivateData()])
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [loadPrivateData, loadResources])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const [profile] = await Promise.all([api('/auth/me')])
        if (active) setUser(profile.user)
      } catch (requestError) {
        if (active) {
          setUser(null)
          if (requestError.status !== 401) setError(requestError.message)
        }
      }
      try {
        const response = await api('/resources')
        if (active) setResources(response.data)
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }
    initialize()
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    async function refreshResources() {
      try {
        await loadResources()
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }
    refreshResources()
    return () => { active = false }
  }, [loadResources])

  useEffect(() => {
    let active = true
    async function refreshPrivateData() {
      try {
        await loadPrivateData()
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }
    refreshPrivateData()
    return () => { active = false }
  }, [loadPrivateData])

  const pendingBookings = useMemo(
    () => bookings.filter((booking) => booking.status === 'pending_approval'),
    [bookings],
  )

  async function submitAuth(event) {
    event.preventDefault()
    setError('')
    setAuthMessage('')
    try {
      const route = authMode === 'register' ? '/auth/register' : '/auth/login'
      const body = {
        ...authForm,
        full_name: authForm.full_name,
        department: authForm.department,
      }
      if (body.student_year) body.student_year = Number(body.student_year)
      const response = await api(route, { method: 'POST', body: JSON.stringify(body) })
      setAuthMessage(response.message || 'Signed in.')
      if (response.authenticated) {
        const profile = await api('/auth/me')
        setUser(profile.user)
      }
    } catch (requestError) {
      if (requestError.status !== 401) setError(requestError.message)
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setBookings([])
      setTimeline([])
      setNotifications([])
      setMessage('Signed out.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createBooking(event) {
    event.preventDefault()
    setError('')
    try {
      const response = await api('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          resource_id: requestingResource.id,
          start_at: new Date(requestForm.start_at).toISOString(),
          end_at: new Date(requestForm.end_at).toISOString(),
          purpose: requestForm.purpose,
        }),
      })
      setMessage(response.data.decision_reason)
      setRequestingResource(null)
      setRequestForm({ start_at: localDateTime(24), end_at: localDateTime(26), purpose: '' })
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createResource(event) {
    event.preventDefault()
    setError('')
    try {
      const eligibility_rules = {
        allowed_departments: resourceForm.allowed_departments.split(',').map((item) => item.trim()).filter(Boolean),
        required_training: resourceForm.required_training.split(',').map((item) => item.trim()).filter(Boolean),
        ...(resourceForm.minimum_year ? { minimum_year: Number(resourceForm.minimum_year) } : {}),
      }
      const excludedFields = ['allowed_departments', 'required_training', 'minimum_year']
      const resourceData = Object.fromEntries(
        Object.entries(resourceForm).filter(([key]) => !excludedFields.includes(key)),
      )
      resourceData.available_from = resourceForm.available_from
        ? new Date(resourceForm.available_from).toISOString()
        : null
      resourceData.available_until = resourceForm.available_until
        ? new Date(resourceForm.available_until).toISOString()
        : null
      const response = await api('/resources', {
        method: 'POST',
        body: JSON.stringify({
          ...resourceData,
          eligibility_rules,
          institutional_ownership_confirmed: true,
        }),
      })
      setMessage(`Resource ${response.data.asset_code} listed for college sharing.`)
      setResourceForm({
        name: '', asset_code: '', description: '', category: 'IT', resource_type: 'equipment',
        location: '', department: '', institution: '', approval_mode: 'manual',
        handover_mode: 'staff_attended', restricted: false, usage_terms: '',
        allowed_departments: '', minimum_year: '', required_training: '', available_from: '', available_until: '',
      })
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function decideBooking(id, approve) {
    const reason = window.prompt(approve ? 'Reason for approval:' : 'Reason for rejection:')
    if (!reason?.trim()) return
    try {
      const response = await api(`/bookings/${id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ approve, reason }),
      })
      setMessage(response.data.decision_reason)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function recordHandover(booking, action) {
    const assetCode = window.prompt(`Enter resource ID ${booking.resources?.asset_code || ''}:`)
    if (!assetCode) return
    const notes = window.prompt(`${action === 'pickup' ? 'Pickup' : 'Return'} condition notes:`) || ''
    try {
      await api(`/bookings/${booking.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ asset_code: assetCode, notes }),
      })
      setMessage(`${action === 'pickup' ? 'Pickup' : 'Return'} recorded.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reportIncident(event) {
    event.preventDefault()
    try {
      const booking = bookings.find((item) => item.id === incidentForm.booking_id)
      const response = await api('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: booking?.id,
          resource_id: booking?.resource_id || incidentForm.resource_id || undefined,
          kind: incidentForm.kind,
          description: incidentForm.description,
        }),
      })
      setMessage(response.message)
      setIncidentForm({ booking_id: '', resource_id: '', kind: 'damage', description: '' })
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function uploadPhoto(resourceId, file) {
    if (!file) return
    try {
      await api(`/resources/${resourceId}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      setMessage('Resource photo uploaded.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function changeResourceStatus(resource, status) {
    const reason = window.prompt(`Reason for setting ${resource.name} to ${status.replaceAll('_', ' ')}:`)
    if (!reason?.trim()) return
    try {
      await api(`/resources/${resource.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      })
      setMessage(`Resource status updated to ${status.replaceAll('_', ' ')}.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function markNotificationRead(id) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH', body: JSON.stringify({}) })
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateAdminUser(profile, changes) {
    try {
      const response = await api(`/admin/users/${profile.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: changes.role ?? profile.role,
          account_status: changes.account_status ?? profile.account_status,
        }),
      })
      setAdminUsers((current) => current.map((item) => item.id === profile.id ? response.data : item))
      if (profile.id === user.id) setUser((current) => ({ ...current, ...response.data }))
      setMessage(`Updated account for ${profile.email}.`)
    } catch (requestError) {
      setError(requestError.message)
      await refresh()
    }
  }

  async function updateAdminIncident(incident, status) {
    const reason = window.prompt(`Reason for setting this incident to ${status.replaceAll('_', ' ')}:`)
    if (!reason?.trim()) return
    try {
      const response = await api(`/admin/incidents/${incident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      })
      setAdminIncidents((current) => current.map((item) => item.id === incident.id ? { ...item, ...response.data } : item))
      setMessage('Incident status updated and recorded in the audit log.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">CR</span>
          <div>
            <p className="eyebrow">Campus Resource Intelligence</p>
            <h1>Shared resource operations</h1>
          </div>
        </div>
        {user ? (
          <div className="user-controls">
            <span className="user-badge">{user.full_name} · {isAdmin ? 'administrator' : 'member'}</span>
            <button type="button" className="secondary-btn" onClick={signOut}>Sign out</button>
          </div>
        ) : null}
      </header>

      {(error || message || authMessage) ? (
        <div className={`notice ${error ? 'notice-error' : ''}`} role="status">
          {error || message || authMessage}
          <button type="button" aria-label="Dismiss message" onClick={() => { setError(''); setMessage(''); setAuthMessage('') }}>×</button>
        </div>
      ) : null}

      {!user ? (
        <main className="welcome-grid">
          <section className="hero-copy">
            <p className="badge">Participating-college resource sharing</p>
            <h2>Make campus resources easier to find, request, and manage.</h2>
            <p className="subtitle">Verified college members can list institution-owned resources, request resources, and record handovers. The backend enforces eligibility and booking rules.</p>
            <div className="feature-points">
              <span>FairShare booking limits</span>
              <span>Lister or administrator approval for restricted resources</span>
              <span>Condition and audit history</span>
            </div>
          </section>
          <section className="auth-card">
            <div className="auth-tabs">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Member registration</button>
            </div>
            <form className="form-stack" onSubmit={submitAuth}>
              {authMode === 'register' ? (
                <>
                  <label>Full name<input required minLength="2" value={authForm.full_name} onChange={(event) => setAuthForm({ ...authForm, full_name: event.target.value })} /></label>
                  <label>Department<input value={authForm.department} onChange={(event) => setAuthForm({ ...authForm, department: event.target.value })} /></label>
                  <label>Study year<input type="number" min="1" max="10" value={authForm.student_year} onChange={(event) => setAuthForm({ ...authForm, student_year: event.target.value })} /></label>
                </>
              ) : null}
              <label>College email<input required type="email" autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
              <label>Password<input required type="password" minLength="10" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
              <button className="primary-btn" type="submit">{authMode === 'login' ? 'Sign in' : 'Create member account'}</button>
              {authMode === 'register' ? <p className="helper-text">Email verification is required. Members may both borrow resources and list institution-owned resources they are authorized to share.</p> : null}
            </form>
          </section>
        </main>
      ) : (
        <>
          <section className="dashboard-strip">
            <div><strong>{dashboard?.resources ?? '—'}</strong><span>active resources</span></div>
            <div><strong>{dashboard?.active_bookings ?? '—'}</strong><span>your active bookings</span></div>
            <div><strong>{dashboard?.pending_requests ?? '—'}</strong><span>requests for your listings</span></div>
            {isAdmin ? <div><strong>{dashboard?.incidents_under_review ?? '—'}</strong><span>incidents to review</span></div> : null}
            <div><strong>{notifications.filter((item) => !item.read_at).length}</strong><span>unread notifications</span></div>
          </section>
          <nav className="tab-bar" aria-label="Dashboard sections">
            {['resources', 'bookings', 'timeline', 'manage'].map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? 'selected' : ''} onClick={() => setActiveTab(tab)}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <button type="button" className="refresh-btn" onClick={refresh}>Refresh</button>
          </nav>

          {activeTab === 'resources' ? (
            <section className="content-section">
              <div className="section-heading">
                <div><p className="eyebrow">Find equipment and spaces</p><h2>Resource catalogue</h2></div>
                <div className="filters">
                  <input aria-label="Search resources" placeholder="Search resources" value={query} onChange={(event) => setQuery(event.target.value)} />
                  <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
                  </select>
                  <input aria-label="Filter by location" placeholder="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
                  <select aria-label="Filter by resource type" value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
                    <option value="">All types</option>
                    {['equipment', 'space', 'facility'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <label className="date-filter">Available from<input aria-label="Available from" type="datetime-local" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} /></label>
                  <label className="date-filter">Available until<input aria-label="Available until" type="datetime-local" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} /></label>
                </div>
              </div>
              {resources.length ? (
                <div className="resource-grid">
                  {resources.map((resource) => (
                    <article className="resource-card" key={resource.id}>
                      <ResourcePhoto resource={resource} onError={setError} />
                      <div className="resource-card-top"><span className="category-chip">{resource.category}</span><span className={`status-chip status-${resource.status}`}>{resource.status.replaceAll('_', ' ')}</span></div>
                      <h3>{resource.name}</h3>
                      <p className="resource-meta">{resource.asset_code} · {resource.location}</p>
                      <p>{resource.description || 'No description supplied.'}</p>
                      <div className="resource-rules">
                        <span>{resource.approval_mode === 'manual' ? 'Lister/admin approval' : 'Automatic approval'}</span>
                        <span>{resource.handover_mode.replaceAll('_', ' ')}</span>
                        {resource.restricted ? <span>Restricted access</span> : null}
                      </div>
                      {resource.eligibility_rules?.allowed_departments?.length ? <p className="helper-text">Eligible departments: {resource.eligibility_rules.allowed_departments.join(', ')}</p> : null}
                      {resource.eligibility_rules?.minimum_year ? <p className="helper-text">Minimum study year: {resource.eligibility_rules.minimum_year}</p> : null}
                      {resource.eligibility_rules?.required_training?.length ? <p className="helper-text">Required training: {resource.eligibility_rules.required_training.join(', ')}</p> : null}
                      {resource.usage_terms ? <p className="helper-text">{resource.usage_terms}</p> : null}
                      <div className="card-actions">
                        {resource.created_by === user?.id
                          ? <span className="helper-text">Your listing</span>
                          : <button className="primary-btn" type="button" onClick={() => setRequestingResource(resource)}>Request resource</button>}
                        {isAdmin || resource.created_by === user?.id ? <label className="upload-btn">Add photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadPhoto(resource.id, event.target.files?.[0])} /></label> : null}
                        {isAdmin || resource.created_by === user?.id ? (
                          <select aria-label={`Set ${resource.name} status`} value={resource.status} onChange={(event) => changeResourceStatus(resource, event.target.value)}>
                            {['available', 'reserved', 'in_use', 'under_maintenance', 'unavailable', 'retired'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                          </select>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="empty-state">No resources match this search. Members can list institution-owned resources they are authorized to share.</p>}
            </section>
          ) : null}

          {activeTab === 'bookings' ? (
            <section className="content-section">
              <div className="section-heading"><div><p className="eyebrow">Requests and handovers</p><h2>Bookings</h2></div></div>
              {pendingBookings.some(canManageBooking) ? (
                <div className="approval-panel">
                  <h3>Requests awaiting approval</h3>
                  {pendingBookings.filter(canManageBooking).map((booking) => (
                    <div className="approval-row" key={booking.id}>
                      <span>{booking.resources?.name || 'Resource'} · {new Date(booking.start_at).toLocaleString()} — {booking.purpose}</span>
                      <div><button className="approve-btn" type="button" onClick={() => decideBooking(booking.id, true)}>Approve</button><button className="reject-btn" type="button" onClick={() => decideBooking(booking.id, false)}>Reject</button></div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="booking-list">
                {bookings.map((booking) => (
                  <article className="booking-card" key={booking.id}>
                    <div className="booking-title"><div><h3>{booking.resources?.name || 'Campus resource'}</h3><p>{booking.resources?.asset_code} · {new Date(booking.start_at).toLocaleString()} to {new Date(booking.end_at).toLocaleString()}</p></div><span className={`status-chip status-${booking.status}`}>{booking.status.replaceAll('_', ' ')}</span></div>
                    <p>{booking.purpose}</p><p className="helper-text">{booking.decision_reason}</p>
                    <div className="card-actions">
                      {booking.status === 'confirmed' && canCompleteHandover(booking) ? <button className="secondary-btn" type="button" onClick={() => recordHandover(booking, 'pickup')}>Record pickup</button> : null}
                      {booking.status === 'checked_out' && canCompleteHandover(booking) ? <button className="secondary-btn" type="button" onClick={() => recordHandover(booking, 'return')}>Record return</button> : null}
                    </div>
                  </article>
                ))}
                {!bookings.length ? <p className="empty-state">Your bookings will appear here.</p> : null}
              </div>
              <form className="incident-form" onSubmit={reportIncident}>
                <h3>Report an incident</h3>
                <select value={incidentForm.booking_id} onChange={(event) => setIncidentForm({ ...incidentForm, booking_id: event.target.value })}>
                  <option value="">Select a booking (optional)</option>
                  {bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.resources?.name} · {booking.id.slice(0, 8)}</option>)}
                </select>
                {!incidentForm.booking_id ? (
                  <select required value={incidentForm.resource_id} onChange={(event) => setIncidentForm({ ...incidentForm, resource_id: event.target.value })}>
                    <option value="">Select a resource</option>
                    {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.asset_code}</option>)}
                  </select>
                ) : null}
                <select value={incidentForm.kind} onChange={(event) => setIncidentForm({ ...incidentForm, kind: event.target.value })}>
                  {['damage', 'loss', 'overdue', 'other'].map((kind) => <option key={kind}>{kind}</option>)}
                </select>
                <textarea required minLength="5" placeholder="Describe what happened" value={incidentForm.description} onChange={(event) => setIncidentForm({ ...incidentForm, description: event.target.value })} />
                <button className="secondary-btn" type="submit">Submit incident report</button>
              </form>
            </section>
          ) : null}

          {activeTab === 'timeline' ? (
            <section className="content-section">
              <div className="section-heading"><div><p className="eyebrow">Traceable activity</p><h2>Transaction timeline</h2></div></div>
              <div className="timeline-list">
                {timeline.map((item, index) => (
                  <article className="timeline-item" key={`${item.type}-${item.occurred_at}-${index}`}>
                    <span className="timeline-dot"></span>
                    <div><p className="timeline-kind">{item.type.replaceAll('_', ' ')}</p><p>{item.data.decision_reason || item.data.description || item.data.notes || item.data.action || item.data.resources?.name || 'Activity recorded'}</p><time>{new Date(item.occurred_at).toLocaleString()}</time></div>
                  </article>
                ))}
                {!timeline.length ? <p className="empty-state">No transaction activity yet.</p> : null}
              </div>
              {notifications.length ? (
                <div className="notification-list">
                  <h3>Notifications</h3>
                  {notifications.slice(0, 10).map((notification) => (
                    <article className={notification.read_at ? 'notification read' : 'notification'} key={notification.id}>
                      <div><strong>{notification.title}</strong><p>{notification.message}</p></div>
                      {!notification.read_at ? <button type="button" onClick={() => markNotificationRead(notification.id)}>Mark read</button> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === 'manage' ? (
            <section className="content-section manage-layout">
              <div>
                <div className="section-heading"><div><p className="eyebrow">Member lending</p><h2>List an institution-owned resource</h2></div></div>
                <form className="form-stack resource-form" onSubmit={createResource}>
                  <label className="check-label"><input required type="checkbox" /> I confirm this resource is institution-owned and I am authorized to list it.</label>
                  <label>Name<input required value={resourceForm.name} onChange={(event) => setResourceForm({ ...resourceForm, name: event.target.value })} /></label>
                  <label>Asset code<input value={resourceForm.asset_code} onChange={(event) => setResourceForm({ ...resourceForm, asset_code: event.target.value })} placeholder="Generated if blank" /></label>
                  <label>Description<textarea value={resourceForm.description} onChange={(event) => setResourceForm({ ...resourceForm, description: event.target.value })} /></label>
                  <div className="form-row">
                    <label>Category<select value={resourceForm.category} onChange={(event) => setResourceForm({ ...resourceForm, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label>Type<select value={resourceForm.resource_type} onChange={(event) => setResourceForm({ ...resourceForm, resource_type: event.target.value })}>{['equipment', 'space', 'facility'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  </div>
                  <label>Location<input required value={resourceForm.location} onChange={(event) => setResourceForm({ ...resourceForm, location: event.target.value })} /></label>
                  <div className="form-row"><label>Department<input required value={resourceForm.department} onChange={(event) => setResourceForm({ ...resourceForm, department: event.target.value })} /></label><label>Institution<input required value={resourceForm.institution} onChange={(event) => setResourceForm({ ...resourceForm, institution: event.target.value })} /></label></div>
                  <div className="form-row"><label>Request window begins<input type="datetime-local" value={resourceForm.available_from} onChange={(event) => setResourceForm({ ...resourceForm, available_from: event.target.value })} /></label><label>Request window ends<input type="datetime-local" value={resourceForm.available_until} onChange={(event) => setResourceForm({ ...resourceForm, available_until: event.target.value })} /></label></div>
                  <div className="form-row">
                    <label>Approval<select value={resourceForm.approval_mode} onChange={(event) => setResourceForm({ ...resourceForm, approval_mode: event.target.value })}><option value="manual">Manual approval</option><option value="auto" disabled={resourceForm.restricted}>Automatic (low risk)</option></select></label>
                    <label>Handover<select value={resourceForm.handover_mode} onChange={(event) => setResourceForm({ ...resourceForm, handover_mode: event.target.value })}><option value="staff_attended">Lister attended</option><option value="self_service" disabled={resourceForm.restricted}>Self service</option></select></label>
                  </div>
                  <label className="check-label"><input type="checkbox" checked={resourceForm.restricted} onChange={(event) => setResourceForm({
                    ...resourceForm,
                    restricted: event.target.checked,
                    approval_mode: event.target.checked ? 'manual' : resourceForm.approval_mode,
                    handover_mode: event.target.checked ? 'staff_attended' : resourceForm.handover_mode,
                  })} /> Restricted resource (forces manual approval and lister-attended handover)</label>
                  <label>Eligible departments (comma-separated)<input value={resourceForm.allowed_departments} onChange={(event) => setResourceForm({ ...resourceForm, allowed_departments: event.target.value })} /></label>
                  <div className="form-row">
                    <label>Minimum study year<input type="number" min="1" max="10" value={resourceForm.minimum_year} onChange={(event) => setResourceForm({ ...resourceForm, minimum_year: event.target.value })} /></label>
                    <label>Required training codes<input value={resourceForm.required_training} onChange={(event) => setResourceForm({ ...resourceForm, required_training: event.target.value })} placeholder="e.g. LAB-101, SAFETY-1" /></label>
                  </div>
                  <label>Usage terms<input value={resourceForm.usage_terms} onChange={(event) => setResourceForm({ ...resourceForm, usage_terms: event.target.value })} /></label>
                  <button className="primary-btn" type="submit">List resource</button>
                </form>
              </div>
              <aside className="side-panel">
                <h3>Operational safeguards</h3>
                <ul>
                  <li>Members manage only the resources they listed; administrators can manage all resources.</li>
                  <li>Personal belongings cannot be listed. Confirm the resource is institution-owned.</li>
                  <li>Restricted resources cannot use automatic approval.</li>
                  <li>Overlapping confirmed bookings are rejected transactionally.</li>
                  <li>Incident reports do not assign fault or penalties.</li>
                </ul>
                {isAdmin ? (
                  <>
                    <h3>Account administration</h3>
                    <div className="admin-list">
                      {adminUsers.map((profile) => (
                        <article className="admin-row" key={profile.id}>
                          <div><strong>{profile.full_name}</strong><p>{profile.email} · {profile.account_status}</p></div>
                          <select aria-label={`Role for ${profile.email}`} value={profile.role} onChange={(event) => updateAdminUser(profile, { role: event.target.value })}>
                            <option value="member">Member</option><option value="administrator">Administrator</option>
                          </select>
                          <select aria-label={`Account status for ${profile.email}`} value={profile.account_status} onChange={(event) => updateAdminUser(profile, { account_status: event.target.value })}>
                            {['unverified', 'verified', 'suspended'].map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </article>
                      ))}
                    </div>
                    <h3>Incident review</h3>
                    <div className="admin-list">
                      {adminIncidents.map((incident) => (
                        <article className="admin-row" key={incident.id}>
                          <div><strong>{incident.resources?.name || 'Resource'} · {incident.kind}</strong><p>{incident.description}</p></div>
                          <select aria-label={`Incident status ${incident.id}`} value={incident.status} onChange={(event) => updateAdminIncident(incident, event.target.value)}>
                            {['reported', 'under_review', 'awaiting_repair', 'resolved', 'closed'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                          </select>
                        </article>
                      ))}
                      {!adminIncidents.length ? <p className="empty-state">No incidents to review.</p> : null}
                    </div>
                    <h3>Audit history</h3>
                    <a className="text-link" href={`${apiBase}/audit`} target="_blank" rel="noreferrer">Open authorized audit endpoint</a>
                  </>
                ) : null}
              </aside>
            </section>
          ) : null}
        </>
      )}

      {requestingResource ? (
        <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setRequestingResource(null) }}>
          <form className="request-modal form-stack" onSubmit={createBooking}>
            <button className="modal-close" type="button" onClick={() => setRequestingResource(null)}>×</button>
            <p className="eyebrow">Booking request</p>
            <h2>{requestingResource.name}</h2>
            <p>{requestingResource.usage_terms || requestingResource.description || 'Review the eligibility and usage requirements before submitting.'}</p>
            {requestingResource.restricted ? <p className="restricted-note">This resource requires approval from its lister or an administrator and attended handover.</p> : null}
            <label>Start<input required type="datetime-local" value={requestForm.start_at} onChange={(event) => setRequestForm({ ...requestForm, start_at: event.target.value })} /></label>
            <label>End<input required type="datetime-local" value={requestForm.end_at} onChange={(event) => setRequestForm({ ...requestForm, end_at: event.target.value })} /></label>
            <label>Purpose<textarea required minLength="3" value={requestForm.purpose} onChange={(event) => setRequestForm({ ...requestForm, purpose: event.target.value })} /></label>
            <button className="primary-btn" type="submit">Submit request</button>
          </form>
        </div>
      ) : null}
    </div>
  )
}

export default App
