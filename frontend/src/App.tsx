import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';

// 사용자 페이지
import { Home } from './pages/Home';
import { MenuDetail } from './pages/MenuDetail';
import { Cart } from './pages/Cart';
import { OrderStatus } from './pages/OrderStatus';

// 관리자 페이지
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminOrderManagement } from './pages/admin/AdminOrderManagement';
import { AdminOrderHistory } from './pages/admin/AdminOrderHistory';
import { AdminMenuManagement } from './pages/admin/AdminMenuManagement';
import { AdminSalesReports } from './pages/admin/AdminSalesReports';
import { AdminPaymentLogs } from './pages/admin/AdminPaymentLogs';
import { AdminSchedule } from './pages/admin/AdminSchedule';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminAnnouncements } from './pages/admin/AdminAnnouncements';

function App() {
  return (
    <CartProvider>
      <Router>
        <Routes>
          {/* 사용자 화면 (모바일) */}
          <Route path="/" element={<Home />} />
          <Route path="/menu/:id" element={<MenuDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order/status/:id" element={<OrderStatus />} />

          {/* 관리자 화면 (데스크탑) */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOrderManagement />} />
            <Route path="history" element={<AdminOrderHistory />} />
            <Route path="payments" element={<AdminPaymentLogs />} />
            <Route path="menus" element={<AdminMenuManagement />} />
            <Route path="reports" element={<AdminSalesReports />} />
            <Route path="schedules" element={<AdminSchedule />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </Router>
    </CartProvider>
  );
}

export default App;
