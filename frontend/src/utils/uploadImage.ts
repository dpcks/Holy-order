/*
[File Role]
Cloudinary 서버리스 이미지 업로드를 담당하는 유틸리티 파일입니다.
환경변수에 등록된 Upload Preset을 활용하여 프론트엔드에서 백엔드를 거치지 않고
안전하고 빠르게 이미지를 저장한 뒤, 최적화된 URL을 반환합니다.
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
