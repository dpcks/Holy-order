import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, Coffee, ChevronRight, AlertCircle } from 'lucide-react';
import { apiClient } from '../../api/client';

/*
[File Role]
관리자 시스템 접근을 위한 전용 로그인 페이지입니다.
보안성이 느껴지면서도 깔끔하고 세련된 디자인을 제공합니다.
*/

const AdminLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // OAuth2 명세에 따라 x-www-form-urlencoded 형식으로 데이터 준비
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await apiClient.post<any, any>('/admin/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      // apiClient 인터셉터가 이미 response.data를 반환하므로 바로 접근
      if (response?.success) {
        // 토큰 저장 및 이동
        localStorage.setItem('adminToken', response.data.access_token);
        navigate('/admin');
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.response?.data?.detail || '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* 배경 이미지 및 오버레이 */}
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[10000ms] scale-110 animate-slow-zoom"
          style={{ backgroundImage: "url('/img/ptcc.jpg')" }}
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      <div className="w-full max-w-[440px] relative z-10">
        {/* 상단 로고 및 타이틀 */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-[28px] shadow-xl shadow-black/5 mb-6 group hover:scale-105 transition-transform duration-500">
            <Coffee className="text-gray-900 group-hover:text-primary transition-colors" size={36} />
          </div>
          <h1 className="text-[32px] font-black text-gray-900 tracking-tight mb-2">
            Holy Order <span className="text-primary">관리자</span>
          </h1>
          <p className="text-gray-400 font-bold tracking-wide text-sm uppercase">
            평택중앙교회 카페 관리자
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white/80 backdrop-blur-2xl rounded-[40px] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-white/50 animate-in fade-in zoom-in-95 duration-700 delay-100">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* 아이디 입력 */}
            <div className="space-y-2">
              <label className="text-[13px] font-black text-gray-500 uppercase tracking-widest ml-1">Username</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-transparent rounded-2xl py-4 pl-14 pr-5 text-gray-900 font-bold placeholder:text-gray-300 focus:bg-white focus:border-primary/20 focus:outline-none transition-all"
                  placeholder="관리자 아이디"
                  required
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div className="space-y-2">
              <label className="text-[13px] font-black text-gray-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLogin(e);
                    }
                  }}
                  className="w-full bg-gray-50 border-2 border-transparent rounded-2xl py-4 pl-14 pr-14 text-gray-900 font-bold placeholder:text-gray-300 focus:bg-white focus:border-primary/20 focus:outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="flex items-center gap-2 text-red-500 bg-red-50 p-4 rounded-2xl animate-in shake duration-300">
                <AlertCircle size={18} />
                <span className="text-[14px] font-bold">{error}</span>
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gray-900 hover:bg-black text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-black/10 flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 group"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  로그인
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* 푸터 정보 */}
        <p className="text-center mt-10 text-gray-400 text-[13px] font-medium">
          © 2026 PTCC-Chruch. All rights reserved.<br />
          <span className="opacity-60">본 페이지는 관리자 전용입니다.</span>
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
