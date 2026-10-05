import React, { useEffect, useRef, useState } from "react";

const API_URL = `${import.meta.env.VITE_API_URL}/api/disease/predict`;

export default function PlantDiseaseRealtime() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const predictingRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startCamera = async () => {
    try {
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "environment",
        },
        audio: false,
      });

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setCameraOn(true);
    } catch (err) {
      console.error(err);
      setError(
        "Could not access camera. Please allow camera permission."
      );
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject
        .getTracks()
        .forEach((track) => track.stop());

      videoRef.current.srcObject = null;
    }

    clearInterval(intervalRef.current);
    intervalRef.current = null;

    setCameraOn(false);
  };

  const captureAndPredict = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    if (videoRef.current.readyState < 2) return;

    // Prevent multiple predictions at the same time
    if (predictingRef.current) return;

    predictingRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          predictingRef.current = false;
          return;
        }

        try {
          setLoading(true);

          const formData = new FormData();

          formData.append(
            "file",
            blob,
            "realtime.jpg"
          );

          const response = await fetch(API_URL, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}`
            );
          }

          const data = await response.json();

          console.log(
            "Disease AI response:",
            data
          );

          if (data.success) {
            setPrediction(data.prediction);
            setError("");
          } else {
            setError("Prediction failed.");
          }
        } catch (err) {
          console.error(
            "Prediction error:",
            err
          );

          setError(
            "Unable to connect to disease AI."
          );
        } finally {
          setLoading(false);
          predictingRef.current = false;
        }
      },
      "image/jpeg",
      0.75
    );
  };

  useEffect(() => {
    if (cameraOn) {
      intervalRef.current = setInterval(
        captureAndPredict,
        1500
      );
    }

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [cameraOn]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1000px",
        margin: "0 auto",
        padding: "20px",
        color: "white",
      }}
    >
      <h2
        style={{
          fontSize: "28px",
          marginBottom: "8px",
        }}
      >
        🌿 Real-Time Plant Disease Detection
      </h2>

      <p
        style={{
          color: "#9ca3af",
          marginBottom: "20px",
        }}
      >
        Point your camera at a plant leaf and
        the AI will continuously analyze it.
      </p>

      {/* CAMERA */}
      <div
        style={{
          position: "relative",
          width: "100%",
          background: "#000",
          borderRadius: "16px",
          overflow: "hidden",
          minHeight: "400px",
        }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            maxHeight: "600px",
            objectFit: "contain",
            display: cameraOn
              ? "block"
              : "none",
          }}
        />

        {!cameraOn && (
          <div
            style={{
              height: "400px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              color: "#9ca3af",
            }}
          >
            <div
              style={{
                fontSize: "50px",
                marginBottom: "10px",
              }}
            >
              📷
            </div>

            <div>
              Camera is currently off
            </div>
          </div>
        )}
      </div>

      {/* HIDDEN CANVAS */}
      <canvas
        ref={canvasRef}
        style={{
          display: "none",
        }}
      />

      {/* CAMERA BUTTON */}
      <div
        style={{
          marginTop: "20px",
        }}
      >
        {!cameraOn ? (
          <button
            onClick={startCamera}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              background: "#22c55e",
              color: "white",
              fontWeight: "bold",
              fontSize: "15px",
            }}
          >
            📷 Start Camera
          </button>
        ) : (
          <button
            onClick={stopCamera}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              background: "#ef4444",
              color: "white",
              fontWeight: "bold",
              fontSize: "15px",
            }}
          >
            ⛔ Stop Camera
          </button>
        )}
      </div>

      {/* LOADING */}
      {loading && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            background: "#1f2937",
            borderRadius: "10px",
          }}
        >
          🔄 Analyzing leaf...
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            background: "#3f1d1d",
            borderRadius: "10px",
            color: "#f87171",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* RESULT */}
      {prediction && (
        <div
          style={{
            marginTop: "25px",
            padding: "20px",
            background: "#1f2937",
            borderRadius: "14px",
          }}
        >
          <h3>
            🤖 AI Detection Result
          </h3>

          <h2
            style={{
              color: "#4ade80",
              marginTop: "10px",
            }}
          >
            {prediction.disease}
          </h2>

          <p>
            Confidence:{" "}
            <strong>
              {prediction.confidence}%
            </strong>
          </p>

          {prediction.top_predictions &&
            prediction.top_predictions.length > 0 && (
              <div>
                <h4>
                  Top Predictions
                </h4>

                {prediction.top_predictions.map(
                  (item, index) => (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        padding: "10px 0",
                        borderBottom:
                          "1px solid #374151",
                      }}
                    >
                      <span>
                        {item.disease}
                      </span>

                      <span>
                        {item.confidence}%
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}