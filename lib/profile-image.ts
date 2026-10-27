export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('กรุณาเลือกรูป JPG, PNG หรือ WebP');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ต้นฉบับต้องมีขนาดไม่เกิน 10 MB');
  const image = document.createElement('img');
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('เตรียมพื้นที่รูปภาพไม่สำเร็จ');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('แปลงรูปภาพไม่สำเร็จ')), 'image/jpeg', 0.82);
  });
  if (blob.size > 2 * 1024 * 1024) throw new Error('รูปภาพหลังปรับขนาดต้องไม่เกิน 2 MB');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
    reader.onerror = () => reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}
