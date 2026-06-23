import { h } from 'https://esm.sh/preact';
import { useState } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { loginUser, registerUser } from '../context/AuthContext.js';

const html = htm.bind(h);

export function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('BUYER'); // BUYER or ADMIN
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await loginUser(email, password);
        window.location.hash = '#/';
      } else {
        await registerUser(email, password, name, role);
        window.location.hash = '#/';
      }
    } catch (err) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <h2>${isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>${isLogin ? 'Login to bid in live bike auctions' : 'Register to start bidding and tracking'}</p>
        </div>

        ${error && html`
          <div class="error-banner">
            <span class="pulse-icon"></span>
            <span>${error}</span>
          </div>
        `}

        <form onSubmit=${handleSubmit}>
          ${!isLogin && html`
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input 
                type="text" 
                class="form-input" 
                placeholder="John Doe" 
                required 
                value=${name}
                onInput=${e => setName(e.target.value)}
              />
            </div>
            
            <div class="form-group">
              <label class="form-label">Account Role</label>
              <select 
                class="form-input" 
                value=${role}
                onChange=${e => setRole(e.target.value)}
              >
                <option value="BUYER">Buyer (Starts with $75,000 credit)</option>
                <option value="ADMIN">Admin (Auction organizer)</option>
              </select>
            </div>
          `}

          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input 
              type="email" 
              class="form-input" 
              placeholder="john@example.com" 
              required 
              value=${email}
              onInput=${e => setEmail(e.target.value)}
            />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input 
              type="password" 
              class="form-input" 
              placeholder="••••••••" 
              required 
              value=${password}
              onInput=${e => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            class="btn btn-success" 
            style="width: 100%; margin-top: 10px;"
            disabled=${loading}
          >
            ${loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Register Account')}
          </button>
        </form>

        <div class="form-toggle">
          ${isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick=${() => { setIsLogin(!isLogin); setError(''); }}>
            ${isLogin ? 'Sign Up' : 'Sign In'}
          </span>
        </div>
      </div>
    </div>
  `;
}
