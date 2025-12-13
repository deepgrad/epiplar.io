import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getProfile, ProfileResponse, ActivityItem } from '../services/api'

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchProfile()
    }
  }, [user])

  const fetchProfile = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getProfile()
      setProfile(data)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Use fetched profile data or fallback to auth user
  const displayUser = profile || {
    username: user.username,
    email: user.email,
    plan: user.plan || 'free',
    plan_display: user.plan === 'pro' ? 'Pro' : user.plan === 'enterprise' ? 'Enterprise' : 'Free',
    stats: {
      scans_this_month: 0,
      total_scans: 0,
      storage_used: '0 B',
      plan: 'free',
      plan_display: 'Free',
      scans_limit: 3,
      scans_reset_date: null,
    },
    recent_activities: [] as ActivityItem[],
  }

  const stats = [
    { label: 'Scans This Month', value: displayUser.stats.scans_this_month.toString() },
    { label: 'Total Scans', value: displayUser.stats.total_scans.toString() },
    { label: 'Storage Used', value: displayUser.stats.storage_used },
    { label: 'Plan', value: displayUser.stats.plan_display },
  ]

  const scansLimit = displayUser.stats.scans_limit
  const scansUsed = displayUser.stats.scans_this_month
  const scansPercentage = scansLimit === -1 ? 0 : Math.min((scansUsed / scansLimit) * 100, 100)
  const isUnlimited = scansLimit === -1

  const getPlanDescription = (plan: string) => {
    switch (plan) {
      case 'pro':
        return 'Unlimited scans, HD reconstruction, all export formats'
      case 'enterprise':
        return 'Everything in Pro, plus custom training and dedicated support'
      default:
        return `${scansLimit} scans per month, basic features`
    }
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
          {error}
          <button
            onClick={fetchProfile}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      <div>
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10 opacity-0 animate-slide-up stagger-1">
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center">
            <span className="text-2xl font-semibold text-foreground">
              {displayUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">{displayUser.username}</h1>
            <p className="text-sm text-muted-foreground">{displayUser.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs font-medium rounded">
                Active
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                displayUser.stats.plan === 'pro'
                  ? 'bg-brand/10 text-brand'
                  : displayUser.stats.plan === 'enterprise'
                  ? 'bg-purple-500/10 text-purple-500'
                  : 'bg-accent text-muted-foreground'
              }`}>
                {displayUser.stats.plan_display} Plan
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="p-4 rounded-xl bg-muted/50 border border-border/50 hover:border-border transition-all duration-300 hover-lift opacity-0 animate-slide-up"
              style={{ animationDelay: `${0.2 + index * 0.1}s` }}
            >
              <p className="text-2xl font-semibold text-foreground mb-1">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Account Settings */}
          <div className="p-6 rounded-xl bg-muted/50 border border-border/50 opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Account Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-border/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Email</p>
                  <p className="text-xs text-muted-foreground">{displayUser.email}</p>
                </div>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-border/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Password</p>
                  <p className="text-xs text-muted-foreground">Last changed: Never</p>
                </div>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Change
                </button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                </div>
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Enable
                </button>
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="p-6 rounded-xl bg-muted/50 border border-border/50 opacity-0 animate-slide-up" style={{ animationDelay: '0.7s' }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Subscription</h2>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-foreground">{displayUser.stats.plan_display} Plan</p>
                <p className="text-xs text-muted-foreground">{getPlanDescription(displayUser.stats.plan)}</p>
              </div>
              {displayUser.stats.plan === 'free' && (
                <Link
                  to="/pricing"
                  className="px-4 py-2 bg-brand hover:bg-brand-500 text-white text-xs font-medium rounded-lg transition-all duration-300 btn-press brand-glow"
                >
                  Upgrade
                </Link>
              )}
              {displayUser.stats.plan !== 'free' && (
                <Link
                  to="/pricing"
                  className="px-4 py-2 bg-accent hover:bg-accent/80 text-foreground text-xs font-medium rounded-lg transition-all duration-300 border border-border border-hover-glow"
                >
                  Manage
                </Link>
              )}
            </div>
            <div className="p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Scans used this month</span>
                <span className="text-xs text-foreground font-medium">
                  {isUnlimited ? `${scansUsed} (Unlimited)` : `${scansUsed} / ${scansLimit}`}
                </span>
              </div>
              <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    isUnlimited ? 'bg-green-500' : scansPercentage >= 100 ? 'bg-red-500' : 'bg-brand'
                  }`}
                  style={{ width: isUnlimited ? '20%' : `${scansPercentage}%` }}
                />
              </div>
              {displayUser.stats.scans_reset_date && (
                <p className="text-xs text-muted-foreground mt-2">
                  Resets on {displayUser.stats.scans_reset_date}
                </p>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="p-6 rounded-xl bg-muted/50 border border-border/50 opacity-0 animate-slide-up" style={{ animationDelay: '0.8s' }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {displayUser.recent_activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
              ) : (
                displayUser.recent_activities.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 py-2 hover:bg-accent/30 rounded-lg px-2 -mx-2 transition-colors duration-200">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-xs">
                      {activity.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{activity.description || activity.action.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">{activity.time_ago}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="p-6 rounded-xl bg-red-500/5 border border-red-500/20 opacity-0 animate-slide-up" style={{ animationDelay: '0.9s' }}>
            <h2 className="text-base font-semibold text-foreground mb-4">Danger Zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Delete Account</p>
                <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
              </div>
              <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-medium rounded-lg transition-all duration-300 border border-red-500/20 btn-press">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
