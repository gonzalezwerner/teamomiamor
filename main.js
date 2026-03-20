import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let container;
let camera, scene, renderer;
let controller;

let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

let portalGroup;
let isPortalPlaced = false;

// Elementos a animar
let crystalHeart, orbitingLights = [], portalParticles, cosmosParticles, floatingText;
let time = 0;

const instructionText = document.getElementById('instruction-text');
const startBtn = document.getElementById('start-btn');

init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

    // Iluminación base para el mundo real
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    // Mejorar calidad de renderizado
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // Retículo mágico (Doble anillo giratorio)
    const reticleGroup = new THREE.Group();
    const ring1 = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff6b81, transparent: true, opacity: 0.8 })
    );
    const ring2 = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.28, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.5 })
    );
    reticleGroup.add(ring1);
    reticleGroup.add(ring2);
    reticleGroup.matrixAutoUpdate = false;
    reticleGroup.visible = false;
    scene.add(reticleGroup);
    reticle = reticleGroup;

    createPortal();

    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
    
    startBtn.addEventListener('click', () => {
        if (!isPortalPlaced && reticle.visible) {
            placePortal();
        }
    });

    renderer.xr.addEventListener('sessionstart', () => {
        instructionText.innerText = "Escanea el suelo lentamente hasta que aparezca la runa mágica.";
    });
}

function createPortal() {
    portalGroup = new THREE.Group();
    portalGroup.visible = false;
    scene.add(portalGroup);

    const portalRadius = 1.2; // Tamaño del portal
    const portalDepth = 20;   // Profundidad del mundo interior

    // ==========================================
    // 1. EL OCLUSOR (La magia que oculta el interior)
    // ==========================================
    const ocluderMaterial = new THREE.MeshBasicMaterial({ 
        colorWrite: false, 
        side: THREE.DoubleSide
    });
    const ocluderGroup = new THREE.Group();
    ocluderGroup.renderOrder = 1; // Dibujar antes que el mundo interior

    // Un túnel largo que esconde todo
    const tunnelGeo = new THREE.CylinderGeometry(portalRadius, portalRadius, portalDepth, 64, 1, true);
    tunnelGeo.rotateX(Math.PI / 2); // Acostarlo
    const tunnelMesh = new THREE.Mesh(tunnelGeo, ocluderMaterial);
    tunnelMesh.position.set(0, portalRadius, -portalDepth/2); // Elevarlo y enviarlo hacia atrás
    ocluderGroup.add(tunnelMesh);

    // Tapa trasera del túnel
    const backCoverGeo = new THREE.CircleGeometry(portalRadius, 64);
    const backCoverMesh = new THREE.Mesh(backCoverGeo, ocluderMaterial);
    backCoverMesh.position.set(0, portalRadius, -portalDepth);
    ocluderGroup.add(backCoverMesh);

    portalGroup.add(ocluderGroup);

    // ==========================================
    // 2. MUNDO INTERIOR (El Cosmos)
    // ==========================================
    const innerWorld = new THREE.Group();
    innerWorld.renderOrder = 2; // Dibujar después del oclusor
    // Asegurarse de que el interior se posicione dentro del túnel oclusor
    innerWorld.position.set(0, portalRadius, 0); 
    portalGroup.add(innerWorld);

    // A. Fondo de Nebulosa (Múltiples sistemas de partículas)
    const particleCount = 15000;
    const cosmosGeo = new THREE.BufferGeometry();
    const cosmosPos = new Float32Array(particleCount * 3);
    const cosmosColors = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color(0xff1493); // Deep Pink
    const colorB = new THREE.Color(0x4b0082); // Indigo
    const colorC = new THREE.Color(0xffd700); // Gold

    for(let i=0; i<particleCount; i++) {
        // Distribuir en un cilindro/esfera gigante
        const theta = Math.random() * Math.PI * 2;
        const radius = Math.random() * portalRadius * 0.95; // Quedarse justo dentro del oclusor
        const z = -Math.random() * (portalDepth - 1) - 0.5;

        cosmosPos[i*3] = Math.cos(theta) * radius;
        cosmosPos[i*3+1] = Math.sin(theta) * radius;
        cosmosPos[i*3+2] = z;

        // Mezclar colores
        const mix = Math.random();
        let finalColor = colorA;
        if(mix > 0.6) finalColor = colorB;
        if(mix > 0.9) finalColor = colorC;

        cosmosColors[i*3] = finalColor.r;
        cosmosColors[i*3+1] = finalColor.g;
        cosmosColors[i*3+2] = finalColor.b;
    }
    cosmosGeo.setAttribute('position', new THREE.BufferAttribute(cosmosPos, 3));
    cosmosGeo.setAttribute('color', new THREE.BufferAttribute(cosmosColors, 3));
    
    const cosmosMat = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false // Muy importante para no pelear con el oclusor
    });
    cosmosParticles = new THREE.Points(cosmosGeo, cosmosMat);
    innerWorld.add(cosmosParticles);

    // B. El Corazón de Cristal Central
    const x = 0, y = 0;
    const heartShape = new THREE.Shape();
    heartShape.moveTo( x + 0.5, y + 0.5 );
    heartShape.bezierCurveTo( x + 0.5, y + 0.5, x + 0.4, y, x, y );
    heartShape.bezierCurveTo( x - 0.6, y, x - 0.6, y + 0.7,x - 0.6, y + 0.7 );
    heartShape.bezierCurveTo( x - 0.6, y + 1.1, x - 0.3, y + 1.54, x + 0.5, y + 1.9 );
    heartShape.bezierCurveTo( x + 1.2, y + 1.54, x + 1.6, y + 1.1, x + 1.6, y + 0.7 );
    heartShape.bezierCurveTo( x + 1.6, y + 0.7, x + 1.6, y, x + 1.0, y );
    heartShape.bezierCurveTo( x + 0.7, y, x + 0.5, y + 0.5, x + 0.5, y + 0.5 );

    const extrudeSettings = { depth: 0.4, bevelEnabled: true, bevelSegments: 4, steps: 2, bevelSize: 0.1, bevelThickness: 0.1 };
    const heartGeo = new THREE.ExtrudeGeometry( heartShape, extrudeSettings );
    heartGeo.center();

    // Material de Cristal Ultra Realista (Transmission)
    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffb6c1,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.9, // Efecto cristalino
        thickness: 0.5,
        emissive: 0xff1493,
        emissiveIntensity: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });

    crystalHeart = new THREE.Mesh( heartGeo, glassMaterial );
    crystalHeart.position.set(0, 0, -3); // Centro de la vista
    crystalHeart.scale.set(0.6, 0.6, 0.6);
    crystalHeart.rotation.z = Math.PI;
    innerWorld.add(crystalHeart);

    // Luz intensa dentro del corazón
    const heartLight = new THREE.PointLight(0xff6b81, 5, 10);
    crystalHeart.add(heartLight);

    // C. Luces/Almas Orbitando
    const orbGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const orbColors = [0xffd700, 0x00ffff, 0xff00ff];
    for(let i=0; i<3; i++) {
        const orbMat = new THREE.MeshBasicMaterial({ color: orbColors[i] });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        // Luz propia para cada orbe
        const orbLight = new THREE.PointLight(orbColors[i], 2, 3);
        orb.add(orbLight);
        
        const pivot = new THREE.Group();
        pivot.position.copy(crystalHeart.position);
        pivot.add(orb);
        
        // Desfase inicial
        orb.position.set(1.5, 0, 0); 
        pivot.rotation.x = Math.random() * Math.PI;
        pivot.rotation.y = Math.random() * Math.PI;
        
        innerWorld.add(pivot);
        orbitingLights.push({ pivot: pivot, speed: 0.02 + Math.random()*0.02 });
    }

    // D. Texto Flotante Dorado
    const loader = new FontLoader();
    loader.load( 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', function ( font ) {
        const textGeo = new TextGeometry( 'Para Geraldine\nMi Universo', {
            font: font,
            size: 0.25,
            height: 0.08,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.02,
            bevelSize: 0.01,
            bevelOffset: 0,
            bevelSegments: 5
        });
        textGeo.center();
        const textMat = new THREE.MeshStandardMaterial({ 
            color: 0xffd700, 
            metalness: 1.0, 
            roughness: 0.2,
            emissive: 0x4a3a00
        });
        floatingText = new THREE.Mesh( textGeo, textMat );
        floatingText.position.set(0, 1.2, -4);
        innerWorld.add(floatingText);
    });

    // ==========================================
    // 3. MARCO DEL PORTAL (Mundo Real)
    // ==========================================
    const frameGroup = new THREE.Group();
    frameGroup.position.set(0, portalRadius, 0);

    // Anillo exterior de luz
    const ringGeo = new THREE.TorusGeometry(portalRadius, 0.05, 16, 100);
    const ringMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        emissive: 0xff6b81, 
        emissiveIntensity: 2,
        metalness: 0.8,
        roughness: 0.2
    });
    const portalRing = new THREE.Mesh(ringGeo, ringMat);
    frameGroup.add(portalRing);

    // Partículas mágicas girando alrededor del marco
    const frameParticleCount = 500;
    const fPartGeo = new THREE.BufferGeometry();
    const fPartPos = new Float32Array(frameParticleCount * 3);
    for(let i=0; i<frameParticleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radiusOffset = portalRadius + (Math.random() - 0.5) * 0.3;
        fPartPos[i*3] = Math.cos(angle) * radiusOffset;
        fPartPos[i*3+1] = Math.sin(angle) * radiusOffset;
        fPartPos[i*3+2] = (Math.random() - 0.5) * 0.2;
    }
    fPartGeo.setAttribute('position', new THREE.BufferAttribute(fPartPos, 3));
    const fPartMat = new THREE.PointsMaterial({
        color: 0xffd700,
        size: 0.03,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    portalParticles = new THREE.Points(fPartGeo, fPartMat);
    frameGroup.add(portalParticles);

    portalGroup.add(frameGroup);
}

function onSelect() {
    if (!isPortalPlaced && reticle.visible) {
        placePortal();
    }
}

function placePortal() {
    // Colocar el portal en la posición del retículo
    portalGroup.position.setFromMatrixPosition(reticle.matrix);
    
    // Orientarlo hacia el usuario (rotación solo en Y)
    const currentCameraPosition = new THREE.Vector3();
    camera.getWorldPosition(currentCameraPosition);
    currentCameraPosition.y = portalGroup.position.y;
    portalGroup.lookAt(currentCameraPosition);
    
    portalGroup.visible = true;
    isPortalPlaced = true;
    
    reticle.visible = false;
    instructionText.innerHTML = "¡El Universo está abierto!<br>Camina hacia adelante y cruza el anillo de luz.";
    startBtn.style.display = 'none';
    
    // Efecto de desvanecimiento para el texto de instrucción
    setTimeout(() => {
        instructionText.style.opacity = '0';
        instructionText.style.transition = 'opacity 2s';
    }, 5000);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    time += 0.01;

    // Animación de los anillos del retículo
    if (reticle.visible) {
        reticle.children[0].rotation.z += 0.02;
        reticle.children[1].rotation.z -= 0.03;
    }

    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource && !isPortalPlaced) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
                instructionText.innerText = "¡Suelo detectado! Toca la pantalla para invocar el Portal.";
                startBtn.style.display = 'block';
            } else {
                reticle.visible = false;
                startBtn.style.display = 'none';
            }
        }
    }

    // ==========================================
    // ANIMACIONES ULTRA COMPLEJAS
    // ==========================================
    if (portalGroup && portalGroup.visible) {
        
        // 1. Latido del Corazón de Cristal (Función matemática para latido realista)
        if (crystalHeart) {
            crystalHeart.rotation.y += 0.005;
            // Ecuación de latido doble
            const beat = Math.pow(Math.sin(time * 3), 64) * 0.15 + Math.pow(Math.sin(time * 3 + 0.3), 64) * 0.1;
            const scale = 0.6 + beat;
            crystalHeart.scale.set(scale, scale, scale);
            
            // Variar intensidad emisiva con el latido
            crystalHeart.material.emissiveIntensity = 0.5 + beat * 5;
        }

        // 2. Órbitas de luz
        orbitingLights.forEach(lightObj => {
            lightObj.pivot.rotation.y += lightObj.speed;
            lightObj.pivot.rotation.z += lightObj.speed * 0.5;
        });

        // 3. Movimiento del Cosmos (Efecto túnel/nebulosa)
        if (cosmosParticles) {
            cosmosParticles.rotation.z -= 0.0005;
            cosmosParticles.rotation.y = Math.sin(time * 0.1) * 0.1; // Balanceo suave
        }

        // 4. Polvo de Hadas en el Marco del Portal
        if (portalParticles) {
            portalParticles.rotation.z += 0.01;
            
            // Hacer que las partículas del marco pulsen de tamaño y color
            const positions = portalParticles.geometry.attributes.position.array;
            for(let i=0; i<positions.length; i+=3) {
                // Pequeño ruido en Z para que vibren
                positions[i+2] = Math.sin(time * 5 + i) * 0.1;
            }
            portalParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 5. Animación del Texto
        if (floatingText) {
            floatingText.position.y = 1.2 + Math.sin(time * 2) * 0.1;
            floatingText.rotation.y = Math.sin(time) * 0.2;
        }
    }

    renderer.render(scene, camera);
}
