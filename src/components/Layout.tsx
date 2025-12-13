import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 glass sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 sm:gap-3">
            <img src={theme === 'dark' ? '/logo-white.svg' : '/logo-purple.svg'} alt="epipar.io" className="w-8 h-8 sm:w-9 sm:h-9" />
            <span className="text-base sm:text-lg font-semibold text-foreground tracking-tight">epipar.io</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link
              to="/"
              className={`text-sm font-medium transition-colors link-underline ${
                isActive('/') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Home
            </Link>
            <Link
              to="/pricing"
              className={`text-sm font-medium transition-colors link-underline ${
                isActive('/pricing') ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Pricing
            </Link>
          </nav>

          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {user ? (
              <>
                <Link to="/profile" className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-2">
                  {user.username}
                </Link>
                <button
                  onClick={logout}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-2"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-2"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-brand hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-all duration-300 btn-press brand-glow"
                >
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-border/40 bg-background">
            <nav className="flex flex-col px-4 py-3 space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm font-medium transition-colors px-3 py-3 rounded-lg ${
                  isActive('/') ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Home
              </Link>
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm font-medium transition-colors px-3 py-3 rounded-lg ${
                  isActive('/pricing') ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Pricing
              </Link>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-accent text-sm font-medium transition-colors px-3 py-3 rounded-lg text-left"
              >
                {theme === 'dark' ? (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Light mode
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    Dark mode
                  </>
                )}
              </button>
            </nav>
            <div className="flex flex-col px-4 pb-4 pt-2 space-y-2 border-t border-border/40">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-3 rounded-lg hover:bg-accent"
                  >
                    {user.username}
                  </Link>
                  <button
                    onClick={() => {
                      logout()
                      setMobileMenuOpen(false)
                    }}
                    className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-3 rounded-lg hover:bg-accent text-left"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors px-3 py-3 rounded-lg hover:bg-accent"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 bg-brand hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors w-full text-center"
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      {children}

      {/* Footer */}
      <footer className="border-t border-border/40 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src={theme === 'dark' ? '/logo-white.svg' : '/logo-purple.svg'} alt="epipar.io" className="w-6 h-6" />
                <span className="text-sm font-semibold text-foreground">epipar.io</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI-powered 3D room reconstruction and furniture search. Transform your space with cutting-edge depth estimation technology.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Product</h4>
              <div className="flex flex-col gap-2">
                <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Features</Link>
                <Link to="/pricing" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
                <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Documentation</a>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Contact</h4>
              <div className="flex flex-col gap-2">
                <a href="mailto:deepgrad.hack@gmail.com" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  deepgrad.hack@gmail.com
                </a>
                <p className="text-xs text-muted-foreground">
                  Built with passion at DeepGrad Hackathon
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © 2025 epipar.io · Built by the DeepGrad Hackathon Team
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
              <a href="mailto:deepgrad.hack@gmail.com" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
