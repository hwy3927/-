import { Injectable, signal, WritableSignal } from '@angular/core';
import { FilesetResolver, HandLandmarker, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type GestureType = 'NONE' | 'OPEN_PALM' | 'FIST' | 'PINCH';

@Injectable({
  providedIn: 'root'
})
export class HandRecognitionService {
  handLandmarker: HandLandmarker | undefined;
  runningMode: 'IMAGE' | 'VIDEO' = 'VIDEO';
  isLoaded = signal(false);
  currentGesture: WritableSignal<GestureType> = signal('NONE');
  videoElement: HTMLVideoElement | undefined;
  
  // Expose key points for interaction if needed (e.g. pinch center)
  pinchCenter = signal<{x: number, y: number} | null>(null);

  constructor() {
    this.initializeHandLandmarker();
  }

  async initializeHandLandmarker() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );
      
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: 'GPU'
        },
        runningMode: this.runningMode,
        numHands: 1
      });
      
      this.isLoaded.set(true);
      console.log('HandLandmarker loaded');
    } catch (error) {
      console.error('Error loading HandLandmarker:', error);
    }
  }

  async startPrediction(video: HTMLVideoElement) {
    this.videoElement = video;
    if (!this.handLandmarker) {
      console.warn('HandLandmarker not loaded yet');
      return;
    }

    const predictWebcam = async () => {
      if (this.handLandmarker && video.currentTime !== 0) {
        let startTimeMs = performance.now();
        const results = this.handLandmarker.detectForVideo(video, startTimeMs);
        
        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          this.analyzeGesture(landmarks);
        } else {
          // No hand detected
          // Optional: decide if we keep last gesture or reset. 
          // Resetting helps responsiveness.
          // this.currentGesture.set('NONE'); 
        }
      }
      requestAnimationFrame(predictWebcam);
    };
    
    predictWebcam();
  }

  private analyzeGesture(landmarks: NormalizedLandmark[]) {
    // MediaPipe Hand Landmarks:
    // 0: Wrist
    // 4: Thumb tip
    // 8: Index tip
    // 12: Middle tip
    // 16: Ring tip
    // 20: Pinky tip
    
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // Helper: Distance between two points (ignoring Z for simplicity in gesture logic usually works well enough)
    const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
      return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    };

    // 1. Check for PINCH (Thumb + Index close)
    const pinchDist = dist(thumbTip, indexTip);
    const isPinch = pinchDist < 0.05; // Threshold can be tuned

    if (isPinch) {
      this.currentGesture.set('PINCH');
      // Calculate center of pinch for potential drag interactions
      this.pinchCenter.set({
        x: (thumbTip.x + indexTip.x) / 2,
        y: (thumbTip.y + indexTip.y) / 2
      });
      return;
    } 

    this.pinchCenter.set(null);

    // 2. Check for FIST (Fingers curled towards palm/wrist)
    // Simple check: Tip of finger is closer to wrist than the PIP joint (knuckle)
    // Landmarks: Index(5,6,7,8), Middle(9,10,11,12), Ring(13,14,15,16), Pinky(17,18,19,20)
    
    const isFingerClosed = (tipIdx: number, pipIdx: number) => {
      return dist(landmarks[tipIdx], wrist) < dist(landmarks[pipIdx], wrist);
    };

    const indexClosed = isFingerClosed(8, 6);
    const middleClosed = isFingerClosed(12, 10);
    const ringClosed = isFingerClosed(16, 14);
    const pinkyClosed = isFingerClosed(20, 18);

    if (indexClosed && middleClosed && ringClosed && pinkyClosed) {
      this.currentGesture.set('FIST');
      return;
    }

    // 3. Check for OPEN PALM (Fingers extended)
    // Opposite of closed, tips far from wrist
    if (!indexClosed && !middleClosed && !ringClosed && !pinkyClosed && !isPinch) {
      this.currentGesture.set('OPEN_PALM');
      return;
    }

    // Default
    // this.currentGesture.set('NONE');
  }
}
