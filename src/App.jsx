import React, { useEffect, useRef, useState, useCallback } from "react";

// Loading Spinner Component
const LoadingSpinner = ({ message = "Processing..." }) => (
  <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
    <div className="relative w-16 h-16 mb-4">
      <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-200 dark:border-blue-700 rounded-full"></div>
      <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <p className="text-gray-700 dark:text-gray-300 font-medium">{message}</p>
  </div>
);

function App() {
  const [scanner, setScanner] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [cameraScanResult, setCameraScanResult] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [editingCorners, setEditingCorners] = useState(null); // For corner editing
  const [originalImage, setOriginalImage] = useState(null); // Original image for editing
  const [dragState, setDragState] = useState(null); // Current drag state
  const [isProcessing, setIsProcessing] = useState(false); // Loading state for image processing

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const editorCanvasRef = useRef(null); // Canvas for corner editing

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

  // Function to draw image with editable corner points
  const drawEditableCorners = useCallback((canvas, image, corners) => {
    const ctx = canvas.getContext("2d");
    canvas.width = image.width || image.videoWidth;
    canvas.height = image.height || image.videoHeight;
    
    // Draw the image
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // Much larger points for mobile (finger size)
    const pointRadius = dragState ? 60 : 50; // Even bigger for visibility under finger
    const innerRadius = dragState ? 25 : 20;
    
    const drawCorner = (corner, label, isBeingDragged = false) => {
      // Glow effect if point is being dragged
      if (isBeingDragged) {
        ctx.shadowColor = "rgba(255, 0, 0, 0.8)";
        ctx.shadowBlur = 20;
      }
      
      // Very large outer circle for easy touch
      ctx.fillStyle = isBeingDragged ? "rgba(255, 0, 0, 0.9)" : "rgba(255, 0, 0, 0.8)";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 6; // Thicker border
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, pointRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      // More visible inner circle
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, innerRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      // More visible central point
      ctx.fillStyle = isBeingDragged ? "darkred" : "red";
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 10, 0, 2 * Math.PI); // Bigger central point
      ctx.fill();
      
      // Reset shadow
      ctx.shadowBlur = 0;
      
      // Bigger and more visible label
      ctx.fillStyle = "black";
      ctx.font = "bold 24px Arial";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 4;
      ctx.strokeText(label, corner.x + pointRadius + 10, corner.y + 8);
      ctx.fillText(label, corner.x + pointRadius + 10, corner.y + 8);
    };
    
    // Draw points (highlight the one being dragged)
    const isDraggingTL = dragState?.corner === "topLeftCorner";
    const isDraggingTR = dragState?.corner === "topRightCorner";
    const isDraggingBL = dragState?.corner === "bottomLeftCorner";
    const isDraggingBR = dragState?.corner === "bottomRightCorner";
    
    drawCorner(corners.topLeftCorner, "TL", isDraggingTL);
    drawCorner(corners.topRightCorner, "TR", isDraggingTR);
    drawCorner(corners.bottomLeftCorner, "BL", isDraggingBL);
    drawCorner(corners.bottomRightCorner, "BR", isDraggingBR);
    
    // Draw very thick connection lines
    ctx.strokeStyle = dragState ? "orange" : "yellow";
    ctx.lineWidth = dragState ? 12 : 10; // Much thicker lines
    ctx.beginPath();
    ctx.moveTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
    ctx.lineTo(corners.topRightCorner.x, corners.topRightCorner.y);
    ctx.lineTo(corners.bottomRightCorner.x, corners.bottomRightCorner.y);
    ctx.lineTo(corners.bottomLeftCorner.x, corners.bottomLeftCorner.y);
    ctx.lineTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
    ctx.stroke();
  }, [dragState]);

  // Initialize editing canvas when editor opens
  useEffect(() => {
    if (editingCorners && originalImage && editorCanvasRef.current) {
      drawEditableCorners(editorCanvasRef.current, originalImage, editingCorners);
    }
  }, [editingCorners, originalImage, dragState, drawEditableCorners]); // Include dragState to redraw during drag

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

    setIsProcessing(true);
    
    try {
      // Create a copy of the canvas for editing
      const canvasCopy = document.createElement('canvas');
      const ctx = canvasCopy.getContext('2d');
      canvasCopy.width = canvas.width;
      canvasCopy.height = canvas.height;
      ctx.drawImage(canvas, 0, 0);
      
      const scan = scanner.extractPaper(canvas, 500, 700);
      const mat = window.cv.imread(canvas);
      const contour = scanner.findPaperContour(mat);
      const corners = scanner.getCornerPoints(contour);
      
      setCameraScanResult({ scan, corners, originalCanvas: canvasCopy });
      mat.delete();
    } catch {
      alert("Capture failed. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileChange = async e => {
    if (!scanner) return;
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    
    const img = new Image();
    img.onload = async () => {
      try {
        const hl = scanner.highlightPaper(img);
        const scan = scanner.extractPaper(img, 500, 700);
        const mat = window.cv.imread(img);
        const contour = scanner.findPaperContour(mat);
        const corners = scanner.getCornerPoints(contour);
        
        // Save original image for editing
        setUploadResult({ hl, scan, corners, originalImage: img });
        mat.delete();
      } catch (error) {
        alert("Error processing image: " + error.message);
      } finally {
        setIsProcessing(false);
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

  // Function to start editing corner points
  const startEditingCorners = (image, corners) => {
    setOriginalImage(image);
    setEditingCorners({ ...corners });
  };

  // Function to get coordinates from an event (touch or mouse)
  const getEventCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Function to find which point is touched
  const findTouchedCorner = (x, y, corners) => {
    const threshold = 100; // Larger detection zone for big points
    const distances = {
      topLeftCorner: Math.hypot(x - corners.topLeftCorner.x, y - corners.topLeftCorner.y),
      topRightCorner: Math.hypot(x - corners.topRightCorner.x, y - corners.topRightCorner.y),
      bottomLeftCorner: Math.hypot(x - corners.bottomLeftCorner.x, y - corners.bottomLeftCorner.y),
      bottomRightCorner: Math.hypot(x - corners.bottomRightCorner.x, y - corners.bottomRightCorner.y)
    };
    
    const closestCorner = Object.keys(distances).reduce((a, b) => 
      distances[a] < distances[b] ? a : b
    );
    
    return distances[closestCorner] < threshold ? closestCorner : null;
  };

  // Start of drag (touch/mouse down)
  const handleDragStart = (e) => {
    if (!editingCorners || !editorCanvasRef.current) return;
    
    e.preventDefault();
    const canvas = editorCanvasRef.current;
    const { x, y } = getEventCoordinates(e, canvas);
    const touchedCorner = findTouchedCorner(x, y, editingCorners);
    
    if (touchedCorner) {
      setDragState({
        corner: touchedCorner,
        startX: x,
        startY: y
      });
      
      // Haptic feedback at start
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      
      // Change cursor to indicate drag
      canvas.style.cursor = 'grabbing';
    }
  };

  // Movement during drag
  const handleDragMove = (e) => {
    if (!dragState || !editingCorners || !editorCanvasRef.current) return;
    
    e.preventDefault();
    const canvas = editorCanvasRef.current;
    const { x, y } = getEventCoordinates(e, canvas);
    
    // Update point position in real time
    const newCorners = { ...editingCorners };
    newCorners[dragState.corner] = { x, y };
    setEditingCorners(newCorners);
    
    // Redraw immediately for fluid feedback
    drawEditableCorners(canvas, originalImage, newCorners);
  };

  // End of drag (touch/mouse up)
  const handleDragEnd = (e) => {
    if (!dragState) return;
    
    e.preventDefault();
    const canvas = editorCanvasRef.current;
    
    // Final feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    // Restore cursor
    if (canvas) {
      canvas.style.cursor = 'pointer';
    }
    
    // Stop drag
    setDragState(null);
  };

  // Function to apply new corner points
  const applyEditedCorners = () => {
    if (!scanner || !originalImage || !editingCorners) return;
    
    try {
      const scan = scanner.extractPaper(originalImage, 500, 700, editingCorners);
      
      // Update result based on image type (upload or camera)
      if (uploadResult) {
        setUploadResult(prev => ({ ...prev, scan, corners: editingCorners }));
      } else if (cameraScanResult) {
        setCameraScanResult(prev => ({ ...prev, scan, corners: editingCorners }));
      }
      
      // Close editor
      setEditingCorners(null);
      setOriginalImage(null);
    } catch (error) {
      alert("Error applying new points: " + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <div className="p-5 font-sans max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">jscanify Document Scanner Demo</h1>

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <LoadingSpinner message="Processing image..." />
          </div>
        )}

        {/* Upload Option */}
        <section className="mb-10">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Scan From File</h2>
          <input 
            type="file" 
            accept="image/*" 
            onChange={onFileChange}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        {uploadResult && (
          <div className="mt-6">
            <h3 className="text-xl font-medium mb-3 text-gray-900 dark:text-white">Highlighted</h3>
            <div className="mb-6 max-w-full overflow-hidden">
              <div ref={el => {
                if (el && uploadResult.hl) {
                  // Clear container before adding new element
                  el.innerHTML = '';
                  uploadResult.hl.style.maxWidth = "100%";
                  uploadResult.hl.style.height = "auto";
                  uploadResult.hl.style.display = "block";
                  el.appendChild(uploadResult.hl);
                }
              }} />
            </div>

            <h3 className="text-xl font-medium mb-3 text-gray-900 dark:text-white">Scanned</h3>
            <div className="relative inline-block w-full max-w-full">
              <div className="w-full overflow-hidden" ref={el => {
                if (el && uploadResult.scan) {
                  // Clear container before adding new element
                  el.innerHTML = '';
                  uploadResult.scan.style.width = "100%";
                  uploadResult.scan.style.maxWidth = "100%";
                  uploadResult.scan.style.height = "auto";
                  uploadResult.scan.style.display = "block";
                  el.appendChild(uploadResult.scan);
                }
              }} />
              <div className="absolute top-2 right-2 flex gap-2">
                <button 
                  onClick={() => startEditingCorners(uploadResult.originalImage || new Image(), uploadResult.corners)} 
                  className="px-3 py-1 rounded text-sm font-medium transition-colors shadow-lg backdrop-blur-sm border text-white"
                  style={{ 
                    backgroundColor: '#059669', 
                    borderColor: '#047857',
                    ':hover': { backgroundColor: '#047857' }
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#047857'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#059669'}
                >
                  ✏️ Edit
                </button>
                <button 
                  onClick={() => saveImage(uploadResult.scan)} 
                  className="px-3 py-1 rounded text-sm font-medium transition-colors shadow-lg backdrop-blur-sm border text-white"
                  style={{ 
                    backgroundColor: '#0284c7', 
                    borderColor: '#0369a1',
                    ':hover': { backgroundColor: '#0369a1' }
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#0369a1'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#0284c7'}
                >
                  💾 Save
                </button>
              </div>
            </div>

            <h4 className="text-lg font-medium mt-6 mb-2 text-gray-900 dark:text-white">Corner Points</h4>
            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm overflow-x-auto text-gray-900 dark:text-gray-100">{JSON.stringify(uploadResult.corners, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Camera Option */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Live Detection</h2>
        <button 
          onClick={cameraActive ? stopCamera : startCamera}
          disabled={isProcessing}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded font-medium transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cameraActive ? "Stop Camera" : "Start Camera"}
        </button>

        {/* Always render video and canvas to avoid ref issues */}
        <video ref={videoRef} className="hidden" />
        <canvas 
          ref={canvasRef} 
          className="w-full mt-3 border border-gray-300 dark:border-gray-600 rounded max-h-96 object-contain bg-white dark:bg-gray-800" 
        />

        {cameraActive && (
          <button 
            onClick={captureFromCamera}
            disabled={isProcessing} 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded font-medium transition-colors mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📸 Capture Scan
          </button>
        )}

        {cameraScanResult && (
          <div className="mt-6">
            <h3 className="text-xl font-medium mb-3 text-gray-900 dark:text-white">Scanned from Camera</h3>
            <div className="relative inline-block w-full max-w-full">
              <div className="w-full overflow-hidden" ref={el => {
                if (el && cameraScanResult.scan) {
                  // Clear container before adding new element
                  el.innerHTML = '';
                  cameraScanResult.scan.style.width = "100%";
                  cameraScanResult.scan.style.maxWidth = "100%";
                  cameraScanResult.scan.style.height = "auto";
                  cameraScanResult.scan.style.display = "block";
                  el.appendChild(cameraScanResult.scan);
                }
              }} />
              <div className="absolute top-2 right-2 flex gap-2">
                <button 
                  onClick={() => startEditingCorners(cameraScanResult.originalCanvas || canvasRef.current, cameraScanResult.corners)} 
                  className="px-3 py-1 rounded text-sm font-medium transition-colors shadow-lg backdrop-blur-sm border text-white"
                  style={{ 
                    backgroundColor: '#059669', 
                    borderColor: '#047857',
                    ':hover': { backgroundColor: '#047857' }
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#047857'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#059669'}
                >
                  ✏️ Edit
                </button>
                <button 
                  onClick={() => saveImage(cameraScanResult.scan)} 
                  className="px-3 py-1 rounded text-sm font-medium transition-colors shadow-lg backdrop-blur-sm border text-white"
                  style={{ 
                    backgroundColor: '#0284c7', 
                    borderColor: '#0369a1',
                    ':hover': { backgroundColor: '#0369a1' }
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#0369a1'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#0284c7'}
                >
                  💾 Save
                </button>
              </div>
            </div>

            <h4 className="text-lg font-medium mt-6 mb-2 text-gray-900 dark:text-white">Corner Points</h4>
            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm overflow-x-auto text-gray-900 dark:text-gray-100">{JSON.stringify(cameraScanResult.corners, null, 2)}</pre>
          </div>
        )}
        </section>

        {/* Corner points editor */}
        {editingCorners && originalImage && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 w-full max-w-full max-h-[95vh] overflow-auto">
              <h2 className="text-xl font-semibold mb-3 text-center text-gray-900 dark:text-white">Adjust Points</h2>
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-3">
                <p className="text-blue-800 dark:text-blue-200 font-medium mb-2 text-sm">Instructions:</p>
                <ul className="text-blue-700 dark:text-blue-300 text-xs list-disc list-inside space-y-1">
                  <li><strong>Touch</strong> the large red points to move them</li>
                  <li><strong>TL</strong>, <strong>TR</strong>, <strong>BL</strong>, <strong>BR</strong> = document corners</li>
                  <li>The <strong>yellow lines</strong> show the scanned area</li>
                  <li><strong>Vibration</strong> = point moved successfully</li>
                </ul>
              </div>
              
              <div className="mb-3 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                <canvas 
                  ref={editorCanvasRef}
                  // Mouse events (desktop)
                  onMouseDown={handleDragStart}
                  onMouseMove={handleDragMove}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                  // Touch events (mobile)
                  onTouchStart={handleDragStart}
                  onTouchMove={handleDragMove}
                  onTouchEnd={handleDragEnd}
                  onTouchCancel={handleDragEnd}
                  className="border-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer max-w-full h-auto mx-auto block shadow-lg touch-none select-none"
                  style={{ maxHeight: '70vh', minHeight: '300px' }}
                />
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                  👆 Drag the large red points to move them
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div className="text-xs text-gray-600 dark:text-gray-400 text-center sm:text-left">
                  💡 Place the points on the 4 corners of the document
                </div>
                <div className="flex gap-3 justify-center">
                  <button 
                    onClick={() => {
                      setEditingCorners(null);
                      setOriginalImage(null);
                    }}
                    className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={applyEditedCorners}
                    className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors text-sm"
                  >
                    ✅ Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}export default App;