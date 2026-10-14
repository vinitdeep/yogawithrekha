import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { usePageTitle } from '../components/ui';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="locked">
      <div className="lock-icon"><Icon name="leaf" size={32} /></div>
      <h1 style={{ fontSize: '2rem' }}>We couldn’t find that page</h1>
      <p className="muted">The link may be out of date, or the page may have moved.</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn btn-primary">Go to the home page</Link>
        <Link to="/courses" className="btn btn-secondary">Browse courses</Link>
      </div>
    </div>
  );
}
