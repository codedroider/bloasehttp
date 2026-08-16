#!/bin/bash

export NODE_ENV=production
export UV_THREADPOOL_SIZE=64

node --max-old-space-size=512 server.js
