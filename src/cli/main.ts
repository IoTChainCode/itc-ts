#!/usr/bin/env node

import * as Path from 'path';
import {CLI, Shim} from 'clime';

const cli = new CLI('greet', Path.join(__dirname, 'commands'));

// Clime in its core provides an object-based command-line infrastructure.
// To have it work as a common CLI, a shim needs to be applied:
const shim = new Shim(cli);
shim.execute(process.argv);

// TODO: add commands
