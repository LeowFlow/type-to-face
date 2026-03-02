export async function startCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });

  videoElement.srcObject = stream;
  await videoElement.play();
  return stream;
}

export function stopCamera(videoElement) {
  if (!videoElement.srcObject) {
    return;
  }

  for (const track of videoElement.srcObject.getTracks()) {
    track.stop();
  }

  videoElement.srcObject = null;
}
