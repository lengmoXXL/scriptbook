#!/bin/bash
set -e

cd $(dirname $0)

DIR=${1:-""}

if [ -z "$DIR" ]; then
    echo "Usage: $0 <directory>"
    exit 1
fi

if [ ! -d "$DIR" ]; then
    echo "Error: Directory '$DIR' does not exist"
    exit 1
fi

TAG="scriptbook/$DIR:latest"

echo "Building $TAG from $DIR..."
docker build -t "$TAG" "$DIR"
echo "Built $TAG"
