import type { BuildContext, CodeSegment } from './types';

/**
 * Builds the common srun/sbatch base segments (account, hardware, container flags).
 * Software-specific segments are appended after these.
 */
export function buildBaseSegments(ctx: BuildContext): CodeSegment[] {
	const { account, hardware, container } = ctx;
	const isSrun = ctx.jobType === 'srun';
	const prefix = isSrun ? ' \\\n\t' : '\n#SBATCH ';
	const flag = (f: string) => `${prefix}${f}`;

	const segments: CodeSegment[] = [];

	if (isSrun) {
		segments.push({ code: 'srun' });
	} else {
		segments.push({ code: '#!/bin/bash' });
	}

	if (hardware.jobName) {
		segments.push({
			code: flag(`--job-name=${hardware.jobName}`),
			annotation: {
				title: 'Job name',
				description:
					'A human-readable label shown in squeue output. Useful for identifying your job in the queue.'
			}
		});
	}

	if (account) {
		segments.push({
			code: flag(`--account=${account}`),
			annotation: {
				title: 'Project account',
				description:
					'Used for SLURM job accounting and authorization. You must be a member of this project on the cluster. Your supervisor assigns you to a project.'
			}
		});
	}

	segments.push({
		code: flag(`--mem=${hardware.ramGb}g`),
		annotation: {
			title: 'Memory limit',
			description:
				'Maximum RAM your job may use. The job is killed if it exceeds this. Request only what you need — over-requesting increases queue wait times for everyone.'
		}
	});

	segments.push({
		code: flag(`--cpus-per-task=${hardware.cpus}`),
		annotation: {
			title: 'CPU cores',
			description:
				'Number of CPU cores allocated to your job. GPU training rarely benefits from more than 8 cores. Data loading is the most common reason to request more.'
		}
	});

	if (hardware.gres) {
		segments.push({
			code: flag(`--gres=gpu:${hardware.gres}:1`),
			annotation: {
				title: 'GPU allocation',
				description:
					'Request a GPU. MIG slices (2g.10gb, 3g.20gb) are partitioned A-100 slices shared by multiple users — ideal for debugging and smaller models. Full GPUs (ampere=A-100, hopper=H-100) are dedicated to your job.'
			}
		});
	}

	if (hardware.timeLimit) {
		segments.push({
			code: flag(`--time=${hardware.timeLimit}`),
			annotation: {
				title: 'Wall-clock time limit',
				description:
					'Maximum duration for your job. The job is killed when the limit is reached. A realistic limit helps the scheduler place your job faster and frees resources sooner.'
			}
		});
	}

	if (hardware.partition) {
		segments.push({
			code: flag(`--partition=${hardware.partition}`),
			annotation: {
				title: 'Partition',
				description:
					'The SLURM partition (queue) to submit to. Leave empty to use the cluster default. Ask your admin which partitions are available to your project.'
			}
		});
	}

	segments.push({
		code: flag(`--container-image=${container.image}`),
		annotation: {
			title: 'Container image',
			description:
				'The Docker/OCI container image to run your job in. This is pulled via Enroot (Pyxis plugin). Use a PyTorch or CUDA image for GPU workloads.'
		}
	});

	if (container.mounts) {
		segments.push({
			code: flag(`--container-mounts=${container.mounts}`),
			annotation: {
				title: 'Volume mounts',
				description:
					'Bind-mounts paths from the host into the container in host:container format (comma-separated). Use this to access datasets, scratch storage, or your home directory inside the container.'
			}
		});
	}

	if (container.writable) {
		segments.push({
			code: flag(`--container-writable`),
			annotation: {
				title: 'Writable container',
				description:
					'Makes the container filesystem writable. Required for installing packages (apt-get, pip) at runtime. Without this, the container is read-only.'
			}
		});
	}

	if (container.remapRoot) {
		segments.push({
			code: flag(`--container-remap-root`),
			annotation: {
				title: 'Remap to root',
				description:
					'Maps your cluster user to root (uid 0) inside the container. Required for running apt-get and most system-level commands. Your actual files remain owned by your cluster user on shared storage.'
			}
		});
	}

	return segments;
}
