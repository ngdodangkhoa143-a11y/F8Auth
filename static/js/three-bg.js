// ==================== THREE.JS 3D PARTICLE BACKGROUND ====================
(function() {
    let scene, camera, renderer, particleSystem;
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;
    
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;

    function init() {
        const canvas = document.getElementById('three-canvas');
        if (!canvas) return;

        // Scene
        scene = new THREE.Scene();
        // Fog to add depth and fade particles out in the distance
        scene.fog = new THREE.FogExp2(0x060709, 0.0018);

        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
        camera.position.z = 1000;

        // Particle Geometry
        const particleCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);

        const colorViolet = new THREE.Color('#7c3aed'); // Violet
        const colorCyan = new THREE.Color('#06b6d4');   // Cyan
        const tempColor = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            // Distribute points in a sphere/cloud
            const radius = 800 + Math.random() * 800;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);

            // Interpolate colors between Violet and Cyan
            const ratio = Math.random();
            tempColor.copy(colorViolet).lerp(colorCyan, ratio);

            colors[i * 3] = tempColor.r;
            colors[i * 3 + 1] = tempColor.g;
            colors[i * 3 + 2] = tempColor.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create a custom soft particle texture programmatically
        const texture = createParticleTexture();

        // Points Material
        const material = new THREE.PointsMaterial({
            size: 8,
            map: texture,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            transparent: true,
            opacity: 0.6
        });

        // Particle System Object
        particleSystem = new THREE.Points(geometry, material);
        scene.add(particleSystem);

        // Renderer
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Event Listeners
        document.addEventListener('mousemove', onDocumentMouseMove);
        window.addEventListener('resize', onWindowResize);

        animate();
    }

    // Helper to draw a glowing circle texture so particles look like soft spheres instead of squares
    function createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');

        // Create radial gradient for smooth glow fadeout
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);

        return new THREE.CanvasTexture(canvas);
    }

    function onDocumentMouseMove(event) {
        // Normalize mouse positions
        mouseX = (event.clientX - windowHalfX) * 0.4;
        mouseY = (event.clientY - windowHalfY) * 0.4;
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);

        // Smooth camera movement based on mouse coords (Lerp)
        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        camera.position.x += (targetX - camera.position.x) * 0.05;
        camera.position.y += (-targetY - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        // Slow automatic cloud rotation
        if (particleSystem) {
            particleSystem.rotation.y += 0.0006;
            particleSystem.rotation.x += 0.0003;
            
            // Add wave effect to positions
            const positions = particleSystem.geometry.attributes.position.array;
            const count = positions.length / 3;
            const time = Date.now() * 0.001;

            for (let i = 0; i < count; i++) {
                // Slightly oscillate y coordinates in space
                const x = positions[i * 3];
                positions[i * 3 + 1] += Math.sin(time + x * 0.01) * 0.15;
            }
            particleSystem.geometry.attributes.position.needsUpdate = true;
        }

        renderer.render(scene, camera);
    }

    // Initialize once page finishes loading
    window.addEventListener('load', () => {
        // Wait briefly to make sure canvas renders
        setTimeout(init, 100);
    });
})();
