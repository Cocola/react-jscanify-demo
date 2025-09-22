import React, { useEffect, useRef, useState } from "react";

function App() {
  const [scanner, setScanner] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [cameraScanResult, setCameraScanResult] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Wait until OpenCV and jscanify are loaded
  useEffect(() => {
    const waitForLibs = () => {
      if (window.cv && window.jscanify) {
        setScanner(new window.jscanify());
      } else {
        setTimeout(waitForLibs, 100);
      }
    };
    waitForLibs();

    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if (!scanner) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
      });
      streamRef.current = stream;

      // Wait until video element is rendered
      const waitForVideo = () =>
        new Promise(resolve => {
          const check = () => {
            if (videoRef.current) resolve();
            else requestAnimationFrame(check);
          };
          check();
        });

      await waitForVideo();

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");

      intervalRef.current = setInterval(() => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const resultCanvas = scanner.highlightPaper(canvas);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(resultCanvas, 0, 0);
        } catch (err) {
          console.warn("Highlight error:", err);
        }
      }, 200);

      setCameraActive(true);
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Could not access camera: " + err.message);
    }
  };

  const captureFromCamera = () => {
    if (!scanner || !canvasRef.current) return;
    const canvas = canvasRef.current;

    try {
      const scan = scanner.extractPaper(canvas, 500, 700);
      const mat = window.cv.imread(canvas);
      const contour = scanner.findPaperContour(mat);
      const corners = scanner.getCornerPoints(contour);
      setCameraScanResult({ scan, corners });
    } catch (err) {
      alert("Capture failed. Try again.");
    }
  };

  const onFileChange = e => {
    if (!scanner) return;
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      try {
        const hl = scanner.highlightPaper(img);
        const scan = scanner.extractPaper(img, 500, 700);
        const mat = window.cv.imread(img);
        const contour = scanner.findPaperContour(mat);
        const corners = scanner.getCornerPoints(contour);
        setUploadResult({ hl, scan, corners });
      } catch (err) {
        alert("Error processing image.");
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const saveImage = canvas => {
    const link = document.createElement("a");
    link.download = "scanned.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="p-5 font-sans max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">jscanify Document Scanner Demo</h1>

      {/* Upload Option */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Scan From File</h2>
        <input 
          type="file" 
          accept="image/*" 
          onChange={onFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {uploadResult && (
          <div className="mt-6">
            <h3 className="text-xl font-medium mb-3">Highlighted</h3>
            <div className="mb-6 max-w-full overflow-hidden">
              <div ref={el => {
                if (el && uploadResult.hl) {
                  // Vider le conteneur avant d'ajouter le nouvel élément
                  el.innerHTML = '';
                  uploadResult.hl.style.maxWidth = "100%";
                  uploadResult.hl.style.height = "auto";
                  uploadResult.hl.style.display = "block";
                  el.appendChild(uploadResult.hl);
                }
              }} />
            </div>

            <h3 className="text-xl font-medium mb-3">Scanned</h3>
            <div className="relative inline-block w-full max-w-full">
              <div className="w-full overflow-hidden" ref={el => {
                if (el && uploadResult.scan) {
                  // Vider le conteneur avant d'ajouter le nouvel élément
                  el.innerHTML = '';
                  uploadResult.scan.style.width = "100%";
                  uploadResult.scan.style.maxWidth = "100%";
                  uploadResult.scan.style.height = "auto";
                  uploadResult.scan.style.display = "block";
                  el.appendChild(uploadResult.scan);
                }
              }} />
              <button 
                onClick={() => saveImage(uploadResult.scan)} 
                className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                💾 Save
              </button>
            </div>

            <h4 className="text-lg font-medium mt-6 mb-2">Corner Points</h4>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">{JSON.stringify(uploadResult.corners, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Camera Option */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Live Detection</h2>
        <button 
          onClick={cameraActive ? stopCamera : startCamera}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-medium transition-colors mb-4"
        >
          {cameraActive ? "Stop Camera" : "Start Camera"}
        </button>

        {/* Always render video and canvas to avoid ref issues */}
        <video ref={videoRef} className="hidden" />
        <canvas 
          ref={canvasRef} 
          className="w-full mt-3 border border-gray-300 rounded max-h-96 object-contain" 
        />

        {cameraActive && (
          <button 
            onClick={captureFromCamera} 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-medium transition-colors mt-3"
          >
            📸 Capture Scan
          </button>
        )}

        {cameraScanResult && (
          <div className="mt-6">
            <h3 className="text-xl font-medium mb-3">Scanned from Camera</h3>
            <div className="relative inline-block w-full max-w-full">
              <div className="w-full overflow-hidden" ref={el => {
                if (el && cameraScanResult.scan) {
                  // Vider le conteneur avant d'ajouter le nouvel élément
                  el.innerHTML = '';
                  cameraScanResult.scan.style.width = "100%";
                  cameraScanResult.scan.style.maxWidth = "100%";
                  cameraScanResult.scan.style.height = "auto";
                  cameraScanResult.scan.style.display = "block";
                  el.appendChild(cameraScanResult.scan);
                }
              }} />
              <button 
                onClick={() => saveImage(cameraScanResult.scan)} 
                className="absolute top-2 right-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                💾 Save
              </button>
            </div>

            <h4 className="text-lg font-medium mt-6 mb-2">Corner Points</h4>
            <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">{JSON.stringify(cameraScanResult.corners, null, 2)}</pre>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;