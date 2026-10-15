import { Suspense, lazy } from 'react';
import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useStore } from './lib/store';
import { DemoControls, DraftPreviewBar, Footer, Header, LearnerFooter, PublicLayout, ScrollToTop } from './components/Layout';
import Home from './pages/Home';
import { CourseDetail, Courses } from './pages/Courses';
import { About, Contact, Faq, Policy } from './pages/Info';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/Auth';
import { Checkout, CheckoutResult } from './pages/Checkout';
import { Account, Dashboard, LessonPage } from './pages/Student';
// Admin code is split into its own chunk so public visitors never download it.
const adminMod = () => import('./pages/admin/Admin');
const AdminLayout = lazy(() => adminMod().then((m) => ({ default: m.AdminLayout })));
const AdminLogin = lazy(() => adminMod().then((m) => ({ default: m.AdminLogin })));
const AdminOverview = lazy(() => adminMod().then((m) => ({ default: m.AdminOverview })));
const AdminStudents = lazy(() => adminMod().then((m) => ({ default: m.AdminStudents })));
const AdminPayments = lazy(() => adminMod().then((m) => ({ default: m.AdminPayments })));
const AdminAudit = lazy(() => adminMod().then((m) => ({ default: m.AdminAudit })));
const AdminCourses = lazy(() => import('./pages/admin/AdminCourses').then((m) => ({ default: m.AdminCourses })));
const AdminCourseEditor = lazy(() => import('./pages/admin/AdminCourses').then((m) => ({ default: m.AdminCourseEditor })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));

const Loading = () => <div className="locked" role="status"><span className="spinner" aria-hidden="true" /> <span className="sr-only">Loading…</span></div>;
import NotFound from './pages/NotFound';

function Root() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

/**
 * Route guard. This is a USABILITY feature only — it decides which screen to show.
 * Demo: there is no real security at all. Production: every protected read and write is
 * authorised by the database (row-level security) and Edge Functions, whatever this guard does.
 */
function RequireAuth({ role }: { role?: 'admin' | 'student' }) {
  const { user } = useStore();
  const loc = useLocation();
  if (!user) {
    const login = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={`${login}?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  if (role === 'admin' && user.role !== 'admin') {
    return (
      <>
        <Header />
        <div className="header-spacer" aria-hidden="true" />
        <main id="main" className="wrap"><div className="locked"><h1 style={{ fontSize: '1.8rem' }}>Admins only</h1><p className="muted">Your account doesn’t have access to the admin dashboard.</p></div></main>
        <Footer />
      </>
    );
  }
  if (role === 'student' && user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/** Signed-in student pages: the public header with a compact learner footer (no sales promotion). */
function StudentLayout() {
  return (
    <>
      <Header />
      <div className="header-spacer" aria-hidden="true" />
      <main id="main" className="page-fade" style={{ minHeight: '60vh' }}><Outlet /></main>
      <LearnerFooter />
      <DraftPreviewBar />
      <DemoControls />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/courses', element: <Courses /> },
          { path: '/courses/:slug', element: <CourseDetail /> },
          { path: '/about', element: <About /> },
          { path: '/faq', element: <Faq /> },
          { path: '/contact', element: <Contact /> },
          { path: '/policies/:kind', element: <Policy /> },
          { path: '/login', element: <Login /> },
          { path: '/register', element: <Register /> },
          { path: '/forgot-password', element: <ForgotPassword /> },
          { path: '/reset-password/:token', element: <ResetPassword /> },
          { path: '/checkout/:slug', element: <Checkout /> },
          { path: '/checkout/result/:orderId', element: <CheckoutResult /> },
          // Lessons handle their own locked / preview states (free previews are public).
          { path: '/learn/:slug/:lessonId', element: <LessonPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        element: <RequireAuth role="student" />,
        children: [{ element: <StudentLayout />, children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/account', element: <Account /> },
        ] }],
      },
      { path: '/admin/login', element: <Suspense fallback={<Loading />}><AdminLogin /></Suspense> },
      {
        element: <RequireAuth role="admin" />,
        children: [{
          path: '/admin',
          element: <Suspense fallback={<Loading />}><AdminLayout /></Suspense>,
          children: [
            { index: true, element: <AdminOverview /> },
            { path: 'courses', element: <AdminCourses /> },
            { path: 'courses/:id', element: <AdminCourseEditor /> },
            { path: 'students', element: <AdminStudents /> },
            { path: 'payments', element: <AdminPayments /> },
            { path: 'audit', element: <AdminAudit /> },
            { path: 'settings', element: <AdminSettings /> },
          ],
        }],
      },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });
