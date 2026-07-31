/*
 * [File Role] Cloudinary 서버리스 이미지 업로드 유틸리티
 *
 * Cloudinary에 원본 이미지를 업로드하고,
 * DB 저장에 사용할 canonical secure_url을 반환한다.
 * 화면별 크기·포맷·품질 최적화는 cloudinaryImage.ts에서 전달 시점에 적용한다.
 */

export const uploadImageToCloudinary = async (file: File): Promise<string> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary 환경변수가 설정되지 않았습니다.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  try {
    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`이미지 업로드 실패: ${response.statusText}`);
    }

    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary 업로드 에러:', error);
    throw error;
  }
};
