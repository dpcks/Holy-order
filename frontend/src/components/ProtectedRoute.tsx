import { Navigate, Outlet } from 'react-router-dom';

/*
[File Role]
관리자 인증 여부를 확인하여 보호된 경로에 대한 접근을 제어합니다.
토큰이 없으면 로그인 페이지로 리다이렉트합니다.
*/

const ProtectedRoute = () => {
  const token = localStorage.getItem('adminToken');

  if (!token) {
    // 인증 토큰이 없으면 로그인 페이지로 리다이렉트
    return <Navigate to="/admin/login" replace />;
  }

  // 토큰이 있으면 하위 라우트(Outlet) 렌더링
  return <Outlet />;
};

export default ProtectedRoute;
