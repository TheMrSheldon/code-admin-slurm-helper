import type { Component } from 'svelte';

export interface SharedOptions {
	debugMode: boolean;
}

export interface CodeSegment {
	code: string;
	annotation?: { title: string; description: string };
}

export interface AnnotatedCommand {
	jobType: 'srun' | 'sbatch';
	segments: CodeSegment[];
}

export interface BuildContext {
	jobType: 'srun' | 'sbatch';
	account: string;
	hardware: {
		cpus: number;
		ramGb: number;
		gres: string;
		timeLimit: string;
		partition: string;
		jobName: string;
	};
	container: {
		image: string;
		mounts: string;
		writable: boolean;
		remapRoot: boolean;
	};
	debugMode: boolean;
}

/** Returns the plain command string by joining all segment codes. */
export function flattenCommand(cmd: AnnotatedCommand): string {
	return cmd.segments.map((s) => s.code).join('');
}

export interface SoftwareType {
	id: string;
	label: string;
	icon: Component;
	description: string;
	/** Initial values for the software-specific options form */
	defaultOptions: Record<string, unknown>;
	/** Svelte component that renders the options form; receives and mutates `options` in place */
	OptionsComponent: Component<{ options: any }>;
	buildCommand(ctx: BuildContext, options: any): AnnotatedCommand;
	buildConnectInstructions?(options: any, debugMode: boolean): string;
}

/**
 * The static definition of a software type, without the OptionsComponent.
 * Each .svelte file exports one of these from its <script module> block;
 * index.ts combines it with the component's default export to form a SoftwareType.
 */
export type SoftwareDefinition = Omit<SoftwareType, 'OptionsComponent'>;
