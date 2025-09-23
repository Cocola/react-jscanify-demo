import React, { useEffect, useRef, useState, useCallback } from "react";

// Loading Spinner Component
const LoadingSpinner = ({ message = "Processing..." }) => (
  <div className="flex flex-col items-center justify-center rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
    <div className="relative mb-4 h-16 w-16">
      <div className="absolute top-0 left-0 h-full w-full rounded-full border-4 border-blue-200 dark:border-blue-700"></div>
      <div className="absolute top-0 left-0 h-full w-full animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
    </div>
    <p className="font-medium text-gray-700 dark:text-gray-300">{message}</p>
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
  const [zoomState, setZoomState] = useState(null); // Zoom magnification state (disabled for performance)
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

    return () => {
      stopCamera();
    };
  }, []);

  // Function to draw image with editable corner points and zoom effect
  const drawEditableCorners = useCallback(
    (canvas, image, corners) => {
      const ctx = canvas.getContext("2d");
      canvas.width = image.width || image.videoWidth;
      canvas.height = image.height || image.videoHeight;

      // Draw the image
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Ultra-optimized point sizes for mobile performance
      const pointRadius = dragState ? 80 : 60; // Much smaller for performance

      const drawCorner = (corner, label, isBeingDragged = false) => {
        // Ultra-simplified drawing for maximum mobile performance
        // Single circle with stroke only - no fills, no multiple layers
        
        ctx.strokeStyle = isBeingDragged ? "#0096ff" : "#ff3c3c";
        ctx.lineWidth = isBeingDragged ? 24 : 18; // 3x thicker for mobile visibility
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, pointRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Simple center dot - minimal
        ctx.fillStyle = isBeingDragged ? "#0096ff" : "#ff3c3c";
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 15, 0, 2 * Math.PI); // 3x bigger center dot
        ctx.fill();

        // Minimal label - no stroke
        ctx.fillStyle = "white";
        ctx.font = "bold 24px Arial";
        ctx.fillText(label, corner.x + pointRadius + 10, corner.y + 8);
      };

      // Zoom disabled for mobile performance - causes too much lag
      // if (dragState && zoomState) {
      //   ... zoom code commented out for performance
      // }

      // Draw points (highlight the one being dragged)
      const isDraggingTL = dragState?.corner === "topLeftCorner";
      const isDraggingTR = dragState?.corner === "topRightCorner";
      const isDraggingBL = dragState?.corner === "bottomLeftCorner";
      const isDraggingBR = dragState?.corner === "bottomRightCorner";

      drawCorner(corners.topLeftCorner, "TL", isDraggingTL);
      drawCorner(corners.topRightCorner, "TR", isDraggingTR);
      drawCorner(corners.bottomLeftCorner, "BL", isDraggingBL);
      drawCorner(corners.bottomRightCorner, "BR", isDraggingBR);

      // Simplified connection lines - 3x thicker for mobile visibility
      ctx.strokeStyle = dragState ? "#ff6500" : "#ffff00";
      ctx.lineWidth = dragState ? 24 : 18; // Much thicker lines for mobile
      ctx.beginPath();
      ctx.moveTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
      ctx.lineTo(corners.topRightCorner.x, corners.topRightCorner.y);
      ctx.lineTo(corners.bottomRightCorner.x, corners.bottomRightCorner.y);
      ctx.lineTo(corners.bottomLeftCorner.x, corners.bottomLeftCorner.y);
      ctx.lineTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
      ctx.stroke();
    },
    [dragState], // Removed zoomState since zoom is disabled
  );

  // Initialize editing canvas when editor opens
  useEffect(() => {
    if (editingCorners && originalImage && editorCanvasRef.current) {
      drawEditableCorners(
        editorCanvasRef.current,
        originalImage,
        editingCorners,
      );
    }
  }, [editingCorners, originalImage, dragState, zoomState, drawEditableCorners]); // Include zoomState to redraw during zoom

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
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
        new Promise((resolve) => {
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
      const canvasCopy = document.createElement("canvas");
      const ctx = canvasCopy.getContext("2d");
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

  const onFileChange = async (e) => {
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

  const saveImage = (canvas) => {
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
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Function to find which point is touched
  const findTouchedCorner = (x, y, corners) => {
    const threshold = 100; // Adjusted for smaller point size
    const distances = {
      topLeftCorner: Math.hypot(
        x - corners.topLeftCorner.x,
        y - corners.topLeftCorner.y,
      ),
      topRightCorner: Math.hypot(
        x - corners.topRightCorner.x,
        y - corners.topRightCorner.y,
      ),
      bottomLeftCorner: Math.hypot(
        x - corners.bottomLeftCorner.x,
        y - corners.bottomLeftCorner.y,
      ),
      bottomRightCorner: Math.hypot(
        x - corners.bottomRightCorner.x,
        y - corners.bottomRightCorner.y,
      ),
    };

    const closestCorner = Object.keys(distances).reduce((a, b) =>
      distances[a] < distances[b] ? a : b,
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
        startY: y,
      });

      // Activate zoom effect
      setZoomState({ x, y });

      // Change cursor to indicate drag
      canvas.style.cursor = "grabbing";
    }
  };

  // Movement during drag - minimal redraw for performance
  const handleDragMove = (e) => {
    if (!dragState || !editingCorners || !editorCanvasRef.current) return;

    e.preventDefault();
    const canvas = editorCanvasRef.current;
    const { x, y } = getEventCoordinates(e, canvas);

    // Update zoom position (but zoom is disabled for performance)
    setZoomState({ x, y });

    // Update point position in real time
    const newCorners = { ...editingCorners };
    newCorners[dragState.corner] = { x, y };
    setEditingCorners(newCorners);

    // NO REDRAW during movement for maximum performance
    // Only visual feedback is the cursor position
  };

  // End of drag (touch/mouse up)
  const handleDragEnd = (e) => {
    if (!dragState) return;

    e.preventDefault();
    const canvas = editorCanvasRef.current;

    // Deactivate zoom effect
    setZoomState(null);

    // Restore cursor
    if (canvas) {
      canvas.style.cursor = "pointer";
    }

    // Stop drag
    setDragState(null);
  };

  // Function to apply new corner points
  const applyEditedCorners = () => {
    if (!scanner || !originalImage || !editingCorners) return;

    try {
      const scan = scanner.extractPaper(
        originalImage,
        500,
        700,
        editingCorners,
      );

      // Update result based on image type (upload or camera)
      if (uploadResult) {
        setUploadResult((prev) => ({ ...prev, scan, corners: editingCorners }));
      } else if (cameraScanResult) {
        setCameraScanResult((prev) => ({
          ...prev,
          scan,
          corners: editingCorners,
        }));
      }

      // Close editor
      setEditingCorners(null);
      setOriginalImage(null);
    } catch (error) {
      alert("Error applying new points: " + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-white transition-colors dark:bg-gray-900">
      <div className="mx-auto max-w-4xl p-5 font-sans">
        <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
          jscanify Document Scanner Demo
        </h1>

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
            <LoadingSpinner message="Processing image..." />
          </div>
        )}

        {/* Upload Option */}
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
            Scan From File
          </h2>
          <input
            type="file"
            accept="image/*"
            onChange={onFileChange}
            disabled={isProcessing}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:file:bg-blue-900 dark:file:text-blue-300 dark:hover:file:bg-blue-800"
          />
          {uploadResult && (
            <div className="mt-6">
              <h3 className="mb-3 text-xl font-medium text-gray-900 dark:text-white">
                Highlighted
              </h3>
              <div className="mb-6 max-w-full overflow-hidden">
                <div
                  ref={(el) => {
                    if (el && uploadResult.hl) {
                      // Clear container before adding new element
                      el.innerHTML = "";
                      uploadResult.hl.style.maxWidth = "100%";
                      uploadResult.hl.style.height = "auto";
                      uploadResult.hl.style.display = "block";
                      el.appendChild(uploadResult.hl);
                    }
                  }}
                />
              </div>

              <h3 className="mb-3 text-xl font-medium text-gray-900 dark:text-white">
                Scanned
              </h3>
              <div className="relative inline-block w-full max-w-full">
                <div
                  className="w-full overflow-hidden"
                  ref={(el) => {
                    if (el && uploadResult.scan) {
                      // Clear container before adding new element
                      el.innerHTML = "";
                      uploadResult.scan.style.width = "100%";
                      uploadResult.scan.style.maxWidth = "100%";
                      uploadResult.scan.style.height = "auto";
                      uploadResult.scan.style.display = "block";
                      el.appendChild(uploadResult.scan);
                    }
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    onClick={() =>
                      startEditingCorners(
                        uploadResult.originalImage || new Image(),
                        uploadResult.corners,
                      )
                    }
                    className="rounded px-3 py-1 text-sm font-medium shadow-lg backdrop-blur-sm transition-colors"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => saveImage(uploadResult.scan)}
                    className="rounded px-3 py-1 text-sm font-medium shadow-lg backdrop-blur-sm transition-colors"
                  >
                    💾 Save
                  </button>
                </div>
              </div>

              <h4 className="mt-6 mb-2 text-lg font-medium text-gray-900 dark:text-white">
                Corner Points
              </h4>
              <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                {JSON.stringify(uploadResult.corners, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Camera Option */}
        <section>
          <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">
            Live Detection
          </h2>
          <button
            onClick={cameraActive ? stopCamera : startCamera}
            disabled={isProcessing}
            className="mb-4 rounded bg-green-500 px-4 py-2 font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </button>

          {/* Always render video and canvas to avoid ref issues */}
          <video ref={videoRef} className="hidden" />
          <canvas
            ref={canvasRef}
            
          />

          {cameraActive && (
            <button
              onClick={captureFromCamera}
              disabled={isProcessing}
              className="mt-3 rounded bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              📸 Capture Scan
            </button>
          )}

          {cameraScanResult && (
            <div className="mt-6">
              <h3 className="mb-3 text-xl font-medium text-gray-900 dark:text-white">
                Scanned from Camera
              </h3>
              <div className="relative inline-block w-full max-w-full">
                <div
                  className="w-full overflow-hidden"
                  ref={(el) => {
                    if (el && cameraScanResult.scan) {
                      // Clear container before adding new element
                      el.innerHTML = "";
                      cameraScanResult.scan.style.width = "100%";
                      cameraScanResult.scan.style.maxWidth = "100%";
                      cameraScanResult.scan.style.height = "auto";
                      cameraScanResult.scan.style.display = "block";
                      el.appendChild(cameraScanResult.scan);
                    }
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <button
                    onClick={() =>
                      startEditingCorners(
                        cameraScanResult.originalCanvas || canvasRef.current,
                        cameraScanResult.corners,
                      )
                    }
                    className="rounded border px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors"
                    style={{
                      backgroundColor: "#059669",
                      borderColor: "#047857",
                      ":hover": { backgroundColor: "#047857" },
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.backgroundColor = "#047857")
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.backgroundColor = "#059669")
                    }
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => saveImage(cameraScanResult.scan)}
                    className="rounded border px-3 py-1 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors"
                    style={{
                      backgroundColor: "#0284c7",
                      borderColor: "#0369a1",
                      ":hover": { backgroundColor: "#0369a1" },
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.backgroundColor = "#0369a1")
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.backgroundColor = "#0284c7")
                    }
                  >
                    💾 Save
                  </button>
                </div>
              </div>

              <h4 className="mt-6 mb-2 text-lg font-medium text-gray-900 dark:text-white">
                Corner Points
              </h4>
              <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                {JSON.stringify(cameraScanResult.corners, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Corner points editor */}
        {editingCorners && originalImage && (
          <div className="bg-opacity-90 fixed inset-0 z-50 flex items-center justify-center bg-black p-2">
            <div className="max-h-[95vh] w-full max-w-full overflow-auto rounded-lg bg-white p-4 dark:bg-gray-800">
              <h2 className="mb-3 text-center text-xl font-semibold text-gray-900 dark:text-white">
                Adjust Points
              </h2>
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/30">
                <p className="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                  Instructions améliorées:
                </p>
                <ul className="list-inside list-disc space-y-1 text-xs text-blue-700 dark:text-blue-300">
                  <li>
                    <strong>Touch</strong> les gros points rouges pour les déplacer
                  </li>
                  <li>
                    <strong>Zoom automatique</strong> pendant le déplacement pour plus de précision
                  </li>
                  <li>
                    <strong>TL</strong>, <strong>TR</strong>,{" "}
                    <strong>BL</strong>, <strong>BR</strong> = coins du document
                  </li>
                  <li>
                    Les <strong>lignes orange en pointillés</strong> indiquent la zone scannée
                  </li>
                  <li>
                    <strong>Vibration tactile</strong> confirme le déplacement réussi
                  </li>
                </ul>
              </div>

              <div className="mb-3 rounded-lg bg-gray-50 p-2 dark:bg-gray-700">
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
                  className="mx-auto block h-auto max-w-full cursor-pointer touch-none rounded border-2 border-gray-400 shadow-lg select-none dark:border-gray-500"
                  style={{ maxHeight: "70vh", minHeight: "300px" }}
                />
                <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
                  👆 Déplacez les gros points rouges - le zoom s'active automatiquement
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-center text-xs text-gray-600 sm:text-left dark:text-gray-400">
                  💡 Place the points on the 4 corners of the document
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setEditingCorners(null);
                      setOriginalImage(null);
                    }}
                    className="rounded-lg bg-gray-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyEditedCorners}
                    className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
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
}
export default App;
