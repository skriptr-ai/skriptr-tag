import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text, Billboard } from '@react-three/drei';

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const lastShootTime = useRef(0);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase'>('patrol');

  const groupRef = useRef<THREE.Group>(null);
  const aimingStartTime = useRef<number | null>(null);
  const warningLaserRef = useRef<THREE.Mesh>(null);

  // Stats determined by drone class type
  const { speed, chaseRange, shootDist, shootCooldown, isHunter } = useMemo(() => {
    const hunter = data.type === 'hunter';
    return {
      isHunter: hunter,
      speed: hunter ? 8.0 : 5.5,
      chaseRange: hunter ? 50.0 : 30.0,
      shootDist: hunter ? 30.0 : 20.0,
      shootCooldown: hunter ? 1200 : 2000
    };
  }, [data.type]);

  // Color theme determined by state & drone class type
  const { headColor, chestColor, visorColor, thrusterGlowColor, thrusterFireColor, labelColor } = useMemo(() => {
    const disabled = data.state === 'disabled';
    
    if (disabled) {
      return {
        headColor: '#222222',
        chestColor: '#444444',
        visorColor: '#111111',
        thrusterGlowColor: '#000000',
        thrusterFireColor: '#000000',
        labelColor: '#666666'
      };
    }
    
    if (isHunter) {
      return {
        headColor: '#ff0077',         // Hot Pink
        chestColor: '#ffaa00',        // Neon Orange/Gold
        visorColor: '#ffffff',        // Pure White visor
        thrusterGlowColor: '#ffaa00',
        thrusterFireColor: '#ff3300',   // Orange-red thruster flame
        labelColor: '#ffaa00'         // Gold nameplate
      };
    }
    
    // Standard Seeker
    return {
      headColor: '#00e5ff',           // Electric Cyan
      chestColor: '#ff0055',          // Fuchsia
      visorColor: '#00ffff',          // Cyan visor
      thrusterGlowColor: '#00e5ff',
      thrusterFireColor: '#00e5ff',     // Cyan thruster flame
      labelColor: '#ff0055'           // Fuchsia nameplate
    };
  }, [data.state, isHunter]);

  // Initialize patrol target
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 10,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 10
    );
  }, [data.position]);

  // Sync physics body position with store position (e.g. for respawning)
  useEffect(() => {
    if (body.current) {
      body.current.setTranslation({ x: data.position[0], y: data.position[1], z: data.position[2] }, true);
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      
      // Also reset patrol target to be near the new spawn
      patrolTarget.current.set(
        data.position[0] + (Math.random() - 0.5) * 10,
        data.position[1],
        data.position[2] + (Math.random() - 0.5) * 10
      );
    }
  }, [data.position]);

  useFrame((state_fiber) => {
    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      if (aimingStartTime.current !== null) {
        aimingStartTime.current = null;
        if (warningLaserRef.current) {
          warningLaserRef.current.visible = false;
        }
      }
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = chaseRange;

    // Check player
    if (playerState === 'active') {
      const playerPos = camera.position.clone();
      playerPos.y = pos.y; // Ignore height difference for distance
      const distToPlayer = currentPos.distanceTo(playerPos);
      if (distToPlayer < closestDist) {
        closestDist = distToPlayer;
        closestTargetPos = playerPos;
      }
    }

    // Check other enemies
    const allEnemies = useGameStore.getState().enemies;
    allEnemies.forEach(e => {
      if (e.id !== data.id && e.state === 'active') {
        const ePos = new THREE.Vector3(e.position[0], pos.y, e.position[2]);
        const distToEnemy = currentPos.distanceTo(ePos);
        if (distToEnemy < closestDist) {
          closestDist = distToEnemy;
          closestTargetPos = ePos;
        }
      }
    });

    // Raycast Line-of-Sight check to player camera
    let hasLOS = false;
    if (playerState === 'active') {
      const eyePos = new THREE.Vector3(
        currentPos.x,
        currentPos.y + (isHunter ? 1.95 : 1.65),
        currentPos.z
      );
      const rawDist = eyePos.distanceTo(camera.position);
      const toPlayerDir = new THREE.Vector3().subVectors(camera.position, eyePos).normalize();
      
      let rayStart = eyePos.clone();
      let remainingDist = rawDist;
      let hit = null;
      let iterations = 0;
      
      while (remainingDist > 0.05 && iterations < 3) {
        iterations++;
        const rayToPlayer = new rapier.Ray(rayStart, toPlayerDir);
        const currentHit = world.castRay(rayToPlayer, remainingDist, true);
        if (!currentHit) {
          break;
        }
        
        const hitCollider = currentHit.collider;
        const rb = hitCollider.parent();
        if (rb && rb.userData && (rb.userData as { name?: string }).name === data.id) {
          // It's the bot's own collider! Move start position past the hit point and try again
          const hitPoint = rayToPlayer.pointAt(currentHit.timeOfImpact);
          // Advance start position by 0.05m along the ray direction
          rayStart.copy(hitPoint).addScaledVector(toPlayerDir, 0.05);
          remainingDist = eyePos.distanceTo(camera.position) - eyePos.distanceTo(rayStart);
        } else {
          // Hit something else (obstacle or player)
          hit = currentHit;
          break;
        }
      }

      if (!hit) {
        hasLOS = true;
      } else {
        const rb = hit.collider.parent();
        if (rb && rb.userData) {
          const userData = rb.userData as { name?: string };
          if (userData.name === 'player') {
            hasLOS = true;
          }
        }
      }
    }

    // AI Logic
    if (closestTargetPos) {
      state.current = 'chase';
    } else if (state.current === 'chase') {
      state.current = 'patrol';
      patrolTarget.current.set(
        currentPos.x + (Math.random() - 0.5) * 40,
        currentPos.y,
        currentPos.z + (Math.random() - 0.5) * 40
      );
      lastPatrolChange.current = Date.now();
    }

    const direction = new THREE.Vector3();

    if (state.current === 'chase' && closestTargetPos) {
      direction.subVectors(closestTargetPos, currentPos).normalize();
      
      const now = Date.now();

      // If already telegraphing the shot
      if (aimingStartTime.current !== null) {
        if (!hasLOS) {
          // If we lost line of sight, immediately stop aiming and turn off pre-fire warning laser!
          aimingStartTime.current = null;
          if (warningLaserRef.current) {
            warningLaserRef.current.visible = false;
          }
        } else {
          const elapsed = now - aimingStartTime.current;

          if (elapsed >= 400) {
            // Eye level offset start aligned with head height
            const startPos = new THREE.Vector3(currentPos.x, currentPos.y + (isHunter ? 1.95 : 1.65), currentPos.z);
            
            // Fire actual raycast bullet pointing directly from our eyes to player eyes!
            const rayDir = new THREE.Vector3().subVectors(camera.position, startPos).normalize();
            
            // Add random spread (seekers miss sometimes, hunters are precise)
            const spread = isHunter ? 0.05 : 0.15;
            rayDir.x += (Math.random() - 0.5) * spread;
            rayDir.y += (Math.random() - 0.5) * spread;
            rayDir.z += (Math.random() - 0.5) * spread;
            rayDir.normalize();
            
            startPos.add(rayDir.clone().multiplyScalar(1.0));

            const ray = new rapier.Ray(startPos, rayDir);
            const hit = world.castRay(ray, chaseRange, true);

            if (hit) {
              const collider = hit.collider;
              const rb = collider.parent();
              if (rb && rb.userData) {
                const userData = rb.userData as { name?: string };
                if (userData.name === 'player') {
                  hitPlayer(data.id);
                  addParticles([camera.position.x, camera.position.y, camera.position.z], '#ff0000');
                  addLaser(
                    [startPos.x, startPos.y, startPos.z],
                    [camera.position.x, camera.position.y, camera.position.z],
                    '#ff0000'
                  );
                } else if (userData.name?.startsWith('bot-')) {
                  useGameStore.getState().hitEnemy(userData.name, false, false, data.id);
                  const hitPoint = ray.pointAt(hit.timeOfImpact);
                  addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                  addLaser(
                    [startPos.x, startPos.y, startPos.z],
                    [hitPoint.x, hitPoint.y, hitPoint.z],
                    '#ff0000'
                  );
                } else {
                  const hitPoint = ray.pointAt(hit.timeOfImpact);
                  addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                  addLaser(
                    [startPos.x, startPos.y, startPos.z],
                    [hitPoint.x, hitPoint.y, hitPoint.z],
                    '#ff0000'
                  );
                }
              } else {
                const hitPoint = ray.pointAt(hit.timeOfImpact);
                addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff0000');
                addLaser(
                  [startPos.x, startPos.y, startPos.z],
                  [hitPoint.x, hitPoint.y, hitPoint.z],
                  '#ff0000'
                );
              }
            }

            aimingStartTime.current = null;
            lastShootTime.current = now;
            if (warningLaserRef.current) {
              warningLaserRef.current.visible = false;
            }
          } else {
            // Telegraph state: Update pre-fire line to track player eye level
            if (warningLaserRef.current) {
              warningLaserRef.current.visible = true;
              const s = new THREE.Vector3(currentPos.x, currentPos.y + (isHunter ? 1.95 : 1.65), currentPos.z);
              const e = camera.position.clone();
              const length = s.distanceTo(e);
              
              warningLaserRef.current.position.copy(s.clone().lerp(e, 0.5));
              const rayDir = e.clone().sub(s).normalize();
              const quaternion = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                rayDir
              );
              warningLaserRef.current.quaternion.copy(quaternion);
              warningLaserRef.current.scale.set(1, length, 1);
              
              // Pulsing opacity warning
              const mat = warningLaserRef.current.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.4 + Math.sin(state_fiber.clock.getElapsedTime() * 30) * 0.3;
            }
          }
        }
      } else {
        // Ready to initiate shoot telegraph
        if (closestDist < shootDist && now - lastShootTime.current > shootCooldown && hasLOS) {
          aimingStartTime.current = now;
        } else {
          if (warningLaserRef.current) {
            warningLaserRef.current.visible = false;
          }
        }
      }
    } else {
      // Patrol
      const now = Date.now();
      if (warningLaserRef.current) {
        warningLaserRef.current.visible = false;
      }
      if (aimingStartTime.current !== null) {
        aimingStartTime.current = null;
      }

      // Change target if reached or if stuck for 4 seconds
      if (currentPos.distanceTo(patrolTarget.current) < 2 || now - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 60,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 60
        );
        lastPatrolChange.current = now;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Apply movement
    const velocity = body.current.linvel();
    body.current.setLinvel({
      x: direction.x * speed,
      y: velocity.y,
      z: direction.z * speed
    }, true);

    // Rotate to face direction
    if (groupRef.current && direction.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      const currentRotation = groupRef.current.rotation.y;
      let diff = targetRotation - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.1;
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      {/* Precision Capsule collider size based on type */}
      <CapsuleCollider 
        args={isHunter ? [0.6, 0.6] : [0.5, 0.5]} 
        position={isHunter ? [0, 1.2, 0] : [0, 1, 0]} 
      />
      
      <group ref={groupRef} position={[0, 0, 0]}>
        {/* PRE-FIRE AIMING telegraph laser sight line */}
        <mesh ref={warningLaserRef} visible={false}>
          <cylinderGeometry args={[0.012, 0.012, 1, 4]} />
          <meshBasicMaterial color="#ff2200" transparent opacity={0.6} toneMapped={false} />
        </mesh>

        {/* 1. Head (Top Segment) */}
        <mesh castShadow position={[0, isHunter ? 1.95 : 1.65, 0]}>
          <sphereGeometry args={[isHunter ? 0.3 : 0.25, 16, 16]} />
          <meshStandardMaterial 
            color={headColor} 
            roughness={0.2} 
            metalness={0.9} 
            emissive={headColor}
            emissiveIntensity={data.state === 'disabled' ? 0 : 0.6}
          />
        </mesh>
        
        {/* Eye/Visor (Mounted on Head) */}
        <mesh position={[0, isHunter ? 2.0 : 1.70, isHunter ? 0.32 : 0.27]}>
          <boxGeometry args={[isHunter ? 0.36 : 0.3, isHunter ? 0.12 : 0.1, isHunter ? 0.12 : 0.1]} />
          <meshBasicMaterial color={data.state === 'disabled' ? '#111' : visorColor} toneMapped={false} />
        </mesh>

        {/* 2. Torso/Chest (Middle Segment) */}
        <mesh castShadow position={[0, isHunter ? 1.2 : 1.0, 0]}>
          <cylinderGeometry args={[isHunter ? 0.58 : 0.48, isHunter ? 0.5 : 0.42, isHunter ? 0.84 : 0.7, 8]} />
          <meshStandardMaterial 
            color={chestColor} 
            roughness={0.3} 
            metalness={0.8} 
            emissive={chestColor}
            emissiveIntensity={data.state === 'disabled' ? 0 : 0.45}
          />
        </mesh>

        {/* 3. Gravity Thruster Base (Bottom Segment) */}
        <mesh castShadow position={[0, isHunter ? 0.54 : 0.45, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[isHunter ? 0.42 : 0.35, isHunter ? 0.54 : 0.45, 8]} />
          <meshStandardMaterial 
            color="#22222d" 
            roughness={0.5} 
            metalness={0.9} 
            emissive={thrusterGlowColor}
            emissiveIntensity={data.state === 'disabled' ? 0 : 0.5}
          />
        </mesh>
        
        {/* Thruster fire effect (small neon cylinder) */}
        {data.state === 'active' && (
          <mesh position={[0, isHunter ? 0.18 : 0.15, 0]}>
            <cylinderGeometry args={[isHunter ? 0.18 : 0.15, 0.01, isHunter ? 0.3 : 0.25, 8]} />
            <meshBasicMaterial color={thrusterFireColor} toneMapped={false} transparent opacity={0.8} />
          </mesh>
        )}

        {/* Username Label */}
        <Billboard position={[0, isHunter ? 3.05 : 2.65, 0]}>
          <Text
            fontSize={0.3}
            color={data.state === 'active' ? labelColor : '#666666'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {data.name || data.id}
          </Text>
        </Billboard>
      </group>
    </RigidBody>
  );
}
