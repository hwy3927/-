import { Component, ElementRef, ViewChild, AfterViewInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HandRecognitionService } from './services/hand-recognition.service';
import { VisualizerComponent } from './components/visualizer/visualizer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, VisualizerComponent],
  templateUrl: './app.component.html',
  styleUrls: []
})
export class AppComponent implements AfterViewInit {
  @ViewChild('webcam') webcamRef!: ElementRef<HTMLVideoElement>;
  
  handService = inject(HandRecognitionService);
  isLoaded = this.handService.isLoaded;
  streamStarted = signal(false);

  async ngAfterViewInit() {
    // Wait for signal to be true before requesting camera if needed, or just start
    // We start camera immediately, but service will wait for model load
    await this.startCamera();
  }

  async startCamera() {
    try {
      const constraints = {
        video: {
          width: 640,
          height: 480,
          frameRate: { ideal: 30 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = this.webcamRef.nativeElement;
      video.srcObject = stream;
      video.addEventListener('loadeddata', () => {
        this.streamStarted.set(true);
        this.handService.startPrediction(video);
      });
    } catch (err) {
      console.error('Camera access denied or error:', err);
      alert('Camera access is required for gesture control.');
    }
  }
}
