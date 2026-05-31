#!/usr/bin/env node
import { ProjectPlanerServer } from './server.js';

const server = new ProjectPlanerServer();
server.run().catch(console.error);