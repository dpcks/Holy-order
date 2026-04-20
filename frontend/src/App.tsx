import React from 'react';

function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-900 font-sans">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg text-center">
        <h1 className="text-3xl font-bold text-blue-600 mb-4">Holy-Order</h1>
        <p className="text-gray-600 mb-8">교회 카페 주문 시스템을 위한 빠른 세팅이 완료되었습니다.</p>
        
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors">
            주문하기
          </button>
          <button className="px-6 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors">
            관리자 모드
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
