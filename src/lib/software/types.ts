import type { Component } from 'svelte';

export interface SharedOptions {
	debugMode: boolean;
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
	buildCommand(base: string, options: any, shared: SharedOptions): string;
	buildConnectInstructions?(options: any, shared: SharedOptions): string;
}

/**
 * The static definition of a software type, without the OptionsComponent.
 * Each .svelte file exports one of these from its <script module> block;
 * index.ts combines it with the component's default export to form a SoftwareType.
 */
export type SoftwareDefinition = Omit<SoftwareType, 'OptionsComponent'>;
