/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';

const SPEED = 12;
const MAX_LASER_DIST = 100;

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  
  const playerState = useGameStore(state => state.playerState);
  const gameState = useGameStore(state => state.gameState);
  const addLaser = useGameStore(state => state.addLaser);
  const hitEnemy = useGameStore(state => state.hitEnemy);
  const addParticles = useGameStore(state => state.addParticles);
  const setPointerLocked = useGameStore(state => state.setPointerLocked);
  const isPointerLocked = useGameStore(state => state.isPointerLocked);
  const setAiming = useGameStore(state => state.setAiming);
  const playerPositionEpoch = useGameStore(state => state.playerPositionEpoch || 0);

  const keys = useRef({ 
    w: false, a: false, s: false, d: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
    space: false
  });
  const lastEmitTime = useRef(0);
  const lastShootTime = useRef(0);

  const lastSpaceTime = useRef(0);
  const shouldJump = useRef(false);
  const lastJumpTime = useRef(0);
  const spaceReleased = useRef(true);

  const gunGroupRef = useRef<THREE.Group>(null);
  const gunVisualRef = useRef<THREE.Group>(null);
  const gunBarrelRef = useRef<THREE.Group>(null);

  // More robust mobile detection (checks for touch support)
  const isTouchDevice = useRef(false);
  useEffect(() => {
    isTouchDevice.current = window.matchMedia('(pointer: coarse)').matches || 
                           'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0;
  }, []);

  // Sync keys ref to match pointer lock state
  useEffect(() => {
    if (!isPointerLocked) {
      keys.current = {
        w: false, a: false, s: false, d: false,
        arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
        space: false
      };
    }
  }, [isPointerLocked]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      let key = e.key.toLowerCase();
      if (key === ' ') {
        key = 'space';
        if (!spaceReleased.current) return;
        spaceReleased.current = false;
        
        const now = Date.now();
        if (now - lastSpaceTime.current < 250) {
          shouldJump.current = true;
        }
        lastSpaceTime.current = now;
      }
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      let key = e.key.toLowerCase();
      if (key === ' ') {
        key = 'space';
        spaceReleased.current = true;
      }
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updatePlayerPosition = useGameStore(state => state.updatePlayerPosition);

  // Shooting logic function
  const shoot = () => {
    if (gameState !== 'playing' || playerState !== 'active') return;
    
    // Rate limit shooting
    const now = Date.now();
    if (now - lastShootTime.current < 200) return;

    // Check weapon overheat / add heat
    const addShotHeat = useGameStore.getState().addShotHeat;
    if (!addShotHeat()) return;

    lastShootTime.current = now;

    // Raycast from camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Start raycast slightly ahead of the camera to avoid hitting the player's own collider
    const rayStart = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.8));
    const ray = new rapier.Ray(rayStart, raycaster.ray.direction);
    const hit = world.castRay(ray, MAX_LASER_DIST, true);

    const startPosVec = new THREE.Vector3();
    if (gunBarrelRef.current) {
      gunBarrelRef.current.getWorldPosition(startPosVec);
    } else {
      startPosVec.copy(camera.position);
    }
    const startPos: [number, number, number] = [startPosVec.x, startPosVec.y, startPosVec.z];

    // Apply recoil
    if (gunVisualRef.current) {
      gunVisualRef.current.position.z = -0.4;
      gunVisualRef.current.rotation.x = 0.1;
    }

    let endPos: [number, number, number];

    if (hit) {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      endPos = [hitPoint.x, hitPoint.y, hitPoint.z];
      
      const collider = hit.collider;
      const rb = collider.parent();
      if (rb && rb.userData) {
        const userData = rb.userData as { name?: string };
        const name = userData.name;
        
        if (name) {
          const relativeY = hitPoint.y - rb.translation().y;
          
          // Check if it's a bot
          if (name.startsWith('bot-')) {
            const botData = useGameStore.getState().enemies.find(e => e.id === name);
            const isHunter = botData?.type === 'hunter';
            const threshold = isHunter ? 1.65 : 1.4;
            const isHeadshot = relativeY > threshold;
            hitEnemy(name, true, isHeadshot);
          } 
          // Check if it's another player (socket ID)
          else if (name !== 'player' && useGameStore.getState().otherPlayers[name]) {
            const isHeadshot = relativeY > 1.4;
            hitEnemy(name, true, isHeadshot);
          }
        }
      }
      
      addParticles(endPos, '#00ffff');
    } else {
      endPos = [
        camera.position.x + raycaster.ray.direction.x * MAX_LASER_DIST,
        camera.position.y + raycaster.ray.direction.y * MAX_LASER_DIST,
        camera.position.z + raycaster.ray.direction.z * MAX_LASER_DIST
      ];
    }

    addLaser(startPos, endPos, '#00ffff');
  };

  useFrame((_, delta) => {
    if (!body.current || gameState !== 'playing') return;

    const mobileInput = useGameStore.getState().mobileInput;

    // Handle Mobile Shooting
    if (mobileInput.shooting) {
      shoot();
    }

    // Movement
    const velocity = body.current.linvel();
    const pos = body.current.translation();
    
    const k = keys.current;
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const joyMoveZ = -mobileInput.move.y;
    const joyMoveX = mobileInput.move.x;

    const combinedMoveZ = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) + joyMoveZ;
    const combinedMoveX = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + joyMoveX;

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, combinedMoveZ);
    direction.addScaledVector(right, combinedMoveX);
    
    // Speed * 1.5 if space (running) is held
    const currentSpeed = k.space ? SPEED * 1.5 : SPEED;

    if (direction.lengthSq() > 0) {
      // Clamp length to 1 to prevent faster diagonal movement if both inputs active (though rare)
      if (direction.lengthSq() > 1) direction.normalize();
      direction.multiplyScalar(currentSpeed);
    }

    // Handle jump logic
    let nextVelocityY = velocity.y;
    if (shouldJump.current) {
      shouldJump.current = false;
      const isGrounded = Math.abs(velocity.y) < 0.1 && pos.y < 0.1;
      const now = Date.now();
      if (isGrounded && now - lastJumpTime.current > 500) {
        nextVelocityY = 11;
        lastJumpTime.current = now;
      }
    }

    body.current.setLinvel({ x: direction.x, y: nextVelocityY, z: direction.z }, true);

    // Smooth camera FOV zoom for aiming
    const isAiming = useGameStore.getState().isAiming;
    const targetFov = isAiming ? 35 : 75;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    if (perspectiveCamera.isPerspectiveCamera && Math.abs(perspectiveCamera.fov - targetFov) > 0.01) {
      perspectiveCamera.fov = THREE.MathUtils.lerp(perspectiveCamera.fov, targetFov, delta * 12);
      perspectiveCamera.updateProjectionMatrix();
    }

    // Mobile Look Rotation
    if (Math.abs(mobileInput.look.x) > 0.01 || Math.abs(mobileInput.look.y) > 0.01) {
      const lookSpeed = 2.0 * delta;
      camera.rotation.y -= mobileInput.look.x * lookSpeed;
      camera.rotation.x -= mobileInput.look.y * lookSpeed;
      
      // Clamp pitch to avoid flipping
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
    }

    // Update camera position to follow rigid body
    camera.position.set(pos.x, pos.y + 1.6, pos.z); // Eye level (raised from 0.8)

    // Sync gun to camera
    if (gunGroupRef.current) {
      gunGroupRef.current.position.copy(camera.position);
      gunGroupRef.current.quaternion.copy(camera.quaternion);
    }
    
    // Recover recoil
    if (gunVisualRef.current) {
      gunVisualRef.current.position.z = THREE.MathUtils.lerp(gunVisualRef.current.position.z, -0.6, delta * 15);
      gunVisualRef.current.rotation.x = THREE.MathUtils.lerp(gunVisualRef.current.rotation.x, 0, delta * 15);
    }

    // Emit position to server
    const now = Date.now();
    if (now - lastEmitTime.current > 50) {
      updatePlayerPosition([pos.x, pos.y, pos.z], camera.rotation.y);
      lastEmitTime.current = now;
    }
  });

  // Prevent context-menu popup when right-clicking to aim
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Handle shooting (left click) and aiming (right click hold)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement || gameState !== 'playing' || playerState !== 'active') return;

      if (e.button === 0) { // Left click
        shoot();
      } else if (e.button === 2) { // Right click
        setAiming(true);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) { // Right click
        setAiming(false);
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [gameState, playerState, setAiming, camera, world, rapier, hitEnemy, addParticles, addLaser]);

  useEffect(() => {
    if (gameState === 'playing' && playerState === 'active' && body.current) {
      const storePos = useGameStore.getState().playerPosition;
      body.current.setTranslation({ x: storePos[0], y: storePos[1], z: storePos[2] }, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [gameState, playerState, playerPositionEpoch]);

  return (
    <>
      {!isTouchDevice.current && gameState === 'playing' && (
        <PointerLockControls 
          onLock={() => setPointerLocked(true)} 
          onUnlock={() => setPointerLocked(false)} 
        />
      )}
      <RigidBody
        ref={body}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 2, 0]}
        enabledRotations={[false, false, false]}
        userData={{ name: 'player' }}
        friction={0}
      >
        <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} friction={0} />
      </RigidBody>

      {/* First Person Gun */}
      <group ref={gunGroupRef}>
        <group ref={gunVisualRef} position={[0.4, -0.3, -0.6]}>
          {/* Main body */}
          <mesh position={[0, 0, 0.2]}>
            <boxGeometry args={[0.1, 0.15, 0.4]} />
            <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Barrel */}
          <mesh position={[0, 0.05, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
            <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Neon accents */}
          <mesh position={[0, 0.08, 0.1]}>
            <boxGeometry args={[0.11, 0.02, 0.2]} />
            <meshBasicMaterial color="#00ffff" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.05, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 8]} />
            <meshBasicMaterial color="#ff00ff" toneMapped={false} />
          </mesh>
          {/* Barrel Tip Reference */}
          <group ref={gunBarrelRef} position={[0, 0.05, -0.3]} />
        </group>
      </group>
    </>
  );
}
