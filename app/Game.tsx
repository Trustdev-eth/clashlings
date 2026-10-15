'use client';
import {useEffect} from 'react';
import {mount} from '../public/game/client.js';
export default function Game(){useEffect(()=>mount(document.getElementById('game-root')),[]);return <div id="game-root"><div className="loading-game"><strong>CLASHLINGS</strong><p>Opening the arena…</p></div></div>;}
