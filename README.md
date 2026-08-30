# ClusterScope

A small Cloud-Native dashboard project built to demonstrate modern **DevOps and Kubernetes practices**.

The project currently provides a simple frontend application built with **React, TypeScript, and Vite**, containerized with **Docker and Nginx**.

## Current Stack

- React + TypeScript
- Vite
- Docker
- Nginx
- GitHub Actions
- GitHub Container Registry (GHCR)

## CI/CD

Every push to `main` triggers a GitHub Actions pipeline that:

1. Installs dependencies
2. Runs ESLint
3. Builds the application
4. Builds the Docker image
5. Publishes the image to GHCR

## Future Goals

The project will gradually evolve into a Kubernetes-focused dashboard with:

- Kubernetes deployment
- Backend API
- Redis
- Kubernetes API integration
- Kubernetes RBAC
- GitOps
- Argo CD

The goal is to build the project incrementally while demonstrating practical **Docker, Kubernetes, CI/CD, Cloud, and DevOps skills**.
