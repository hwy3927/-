import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, effect, inject, Input } from '@angular/core';
import * as THREE from 'three';
import { HandRecognitionService, GestureType } from '../../services/hand-recognition.service';

@Component({
  selector: 'app-visualizer',
  standalone: true,
  template: `
    <div #rendererContainer class="absolute inset-0 w-full h-full -z-10"></div>
    <div class="absolute bottom-10 left-10 pointer-events-none z-10 text-[#D4AF37] mix-blend-difference">
      <h2 class="font-cinzel text-xl tracking-[0.2em] uppercase mb-2">System Status</h2>
      <p class="text-sm font-light opacity-80 tracking-widest">{{ activeGesture() }}</p>
    </div>
  `,
  styles: []
})
export class VisualizerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererContainer') rendererContainer!: ElementRef;

  handService = inject(HandRecognitionService);
  activeGesture = this.handService.currentGesture;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationId: number | null = null;
  
  // Image Data
  private meshes: THREE.Mesh[] = [];
  private imageCount = 50;
  
  // Targets
  private targets: { scatter: THREE.Vector3[], tree: THREE.Vector3[], focus: THREE.Vector3[] } = {
    scatter: [],
    tree: [],
    focus: []
  };

  constructor() {
    // React to gesture changes
    effect(() => {
      const gesture = this.activeGesture();
      this.transitionTo(gesture);
    });
  }

  ngAfterViewInit() {
    this.initThree();
    this.createObjects();
    this.animate();
    
    // Initial State
    this.transitionTo('OPEN_PALM'); // Start scattered
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  ngOnDestroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    // Cleanup Three.js
    this.renderer.dispose();
  }

  private initThree() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.scene = new THREE.Scene();
    // Luxurious Fog
    this.scene.fog = new THREE.FogExp2(0x050505, 0.001);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 10000);
    this.camera.position.z = 2500;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.rendererContainer.nativeElement.appendChild(this.renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(0, 10, 10);
    this.scene.add(dirLight);
  }

  private createObjects() {
    // Geometry for images
    const geometry = new THREE.PlaneGeometry(120, 160);
    
    // Pre-calculate positions for different formations
    
    // 1. Scatter (Random)
    for (let i = 0; i < this.imageCount; i++) {
      const x = Math.random() * 4000 - 2000;
      const y = Math.random() * 4000 - 2000;
      const z = Math.random() * 4000 - 2000;
      this.targets.scatter.push(new THREE.Vector3(x, y, z));
    }

    // 2. Tree (Cone / Fractal-ish structure)
    // Simple spiral cone for "Tree" representation
    for (let i = 0; i < this.imageCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / this.imageCount);
      const theta = Math.sqrt(this.imageCount * Math.PI) * phi;
      
      // Sphere->Tree modification: make it taller, narrower bottom
      const r = 800;
      const x = r * Math.cos(theta) * Math.sin(phi);
      const y = i * 20 - 500; // Linear vertical stacking
      const z = r * Math.sin(theta) * Math.sin(phi);
      
      this.targets.tree.push(new THREE.Vector3(x, y, z));
    }

    // 3. Focus (Grid/Gallery view + one main?)
    // Let's do a curved wall or simple grid
    for (let i = 0; i < this.imageCount; i++) {
        const theta = i * 0.175 + Math.PI;
        const y = -(Math.floor(i / 10) * 180) + 400;
        const radius = 1200;
        
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        
        // Slightly look at center
        this.targets.focus.push(new THREE.Vector3(x, y, z));
    }

    // Create Meshes
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    for (let i = 0; i < this.imageCount; i++) {
      // Use Picsum with random seed to get different images
      const imageUrl = `https://picsum.photos/seed/${i + 100}/200/300`;
      
      const material = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        side: THREE.DoubleSide,
        map: loader.load(imageUrl),
        transparent: true,
        opacity: 0.8
      });
      
      const object = new THREE.Mesh(geometry, material);
      
      // Start at scatter pos
      object.position.copy(this.targets.scatter[i]);
      object.rotation.x = Math.random() * Math.PI;
      object.rotation.y = Math.random() * Math.PI;
      
      // Store target refs in userData for animation loop
      object.userData = {
        targetPosition: this.targets.scatter[i].clone(),
        targetRotation: new THREE.Euler(0, 0, 0)
      };

      this.scene.add(object);
      this.meshes.push(object);
    }
  }

  // State Management
  private transitionTo(gesture: GestureType) {
    if (gesture === 'NONE') return;

    let targetSet: THREE.Vector3[] = this.targets.scatter;
    let lookAtCenter = false;

    if (gesture === 'PINCH') {
      targetSet = this.targets.focus;
      lookAtCenter = true;
    } else if (gesture === 'FIST') {
      targetSet = this.targets.tree;
      lookAtCenter = true;
    } else if (gesture === 'OPEN_PALM') {
      targetSet = this.targets.scatter;
      lookAtCenter = false;
    }

    // Update targets in userData
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].userData['targetPosition'] = targetSet[i];
      
      const targetRot = new THREE.Euler();
      if (lookAtCenter) {
        // Calculate rotation to look at center (0,0,0) or camera position
        // Quick hack: Use a dummy object to compute lookAt rotation
        const dummy = new THREE.Object3D();
        dummy.position.copy(targetSet[i]);
        dummy.lookAt(0, 0, 2500); // Look at camera roughly
        targetRot.copy(dummy.rotation);
      } else {
        targetRot.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      }
      this.meshes[i].userData['targetRotation'] = targetRot;
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    // Smooth Lerp
    const delta = 0.05;

    for (let i = 0; i < this.meshes.length; i++) {
      const object = this.meshes[i];
      const targetPos = object.userData['targetPosition'] as THREE.Vector3;
      const targetRot = object.userData['targetRotation'] as THREE.Euler;

      object.position.lerp(targetPos, delta);
      
      // Simple rotation lerp ( quaternions are better but Euler is sufficient for this demo)
      object.rotation.x += (targetRot.x - object.rotation.x) * delta;
      object.rotation.y += (targetRot.y - object.rotation.y) * delta;
      object.rotation.z += (targetRot.z - object.rotation.z) * delta;
    }

    // Subtle camera movement
    const time = Date.now() * 0.0001;
    this.camera.position.x += (Math.sin(time) * 100 - this.camera.position.x) * 0.01;
    this.camera.position.y += (Math.cos(time) * 100 - this.camera.position.y) * 0.01;
    this.camera.lookAt(this.scene.position);

    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
