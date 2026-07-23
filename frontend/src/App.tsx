import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { CartProvider } from './context/CartContext';

// 사용자 페이지
import { Home } from './pages/Home';
import { MenuDetail } from './pages/MenuDetail';
import { Cart } from './pages/Cart';
import { OrderStatus } from './pages/OrderStatus';
import { PublicRealtimeLayout } from './components/layout/PublicRealtimeLayout';

// 관리자 페이지 (Lazy Loading)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminOrderManagement = lazy(() => import('./pages/admin/AdminOrderManagement').then(m => ({ default: m.AdminOrderManagement })));
const AdminOrderHistory = lazy(() => import('./pages/admin/AdminOrderHistory').then(m => ({ default: m.AdminOrderHistory })));
const AdminMenuManagement = lazy(() => import('./pages/admin/AdminMenuManagement').then(m => ({ default: m.AdminMenuManagement })));
const AdminSalesReports = lazy(() => import('./pages/admin/AdminSalesReports').then(m => ({ default: m.AdminSalesReports })));
const AdminPaymentLogs = lazy(() => import('./pages/admin/AdminPaymentLogs').then(m => ({ default: m.AdminPaymentLogs })));
const AdminSchedule = lazy(() => import('./pages/admin/AdminSchedule').then(m => ({ default: m.AdminSchedule })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements').then(m => ({ default: m.AdminAnnouncements })));
const AdminIngredients = lazy(() => import('./pages/admin/AdminIngredients').then(m => ({ default: m.AdminIngredients })));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));

import ProtectedRoute from './components/ProtectedRoute';

// 로딩 화면 컴포넌트
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50/50 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-gray-400 font-bold animate-pulse text-sm">페이지를 불러오고 있습니다...</p>
    </div>
  </div>
);

function App() {
  return (
    <CartProvider>
      <Toaster position="top-center" reverseOrder={false} />
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* 사용자 화면 (모바일) - PublicRealtimeLayout이 WebSocket 1개를 유지 */}
            <Route element={<PublicRealtimeLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/menu/:id" element={<MenuDetail />} />
              <Route path="/cart" element={<Cart />} />
            </Route>
            {/* 주문 추적: 전용 WS를 사용하므로 레이아웃 밖 */}
            <Route path="/order/status/:id" element={<OrderStatus />} />

            {/* 관리자 화면 (데스크탑) */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* 로그인 보호가 필요한 관리자 경로 */}
            <Route element={<ProtectedRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOrderManagement />} />
                <Route path="history" element={<AdminOrderHistory />} />
                <Route path="payments" element={<AdminPaymentLogs />} />
                <Route path="menus" element={<AdminMenuManagement />} />
                <Route path="reports" element={<AdminSalesReports />} />
                <Route path="schedules" element={<AdminSchedule />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="ingredients" element={<AdminIngredients />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </CartProvider>
  );
}

export default App;
