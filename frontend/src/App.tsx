import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { Home } from './pages/Home';
import { MenuDetail } from './pages/MenuDetail';
import { Cart } from './pages/Cart';
import { OrderStatus } from './pages/OrderStatus';

function App() {
  return (
    <CartProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu/:id" element={<MenuDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order/status/:id" element={<OrderStatus />} />
        </Routes>
      </Router>
    </CartProvider>
  );
}

export default App;
