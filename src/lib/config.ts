import yaml from 'js-yaml';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface HardwareDefaults {
	cpus: number;
	ram_gb: number;
	gpu: string;
	time: string;
}

export interface SubQuestionOption {
	label: string;
	hardware_overrides: Partial<HardwareDefaults>;
}

export interface SubQuestion {
	id: string;
	label: string;
	options: SubQuestionOption[];
}

export interface Stage {
	id: string;
	label: string;
	description: string;
	hardware_defaults: HardwareDefaults;
	sub_questions?: SubQuestion[];
}

export interface ClusterInterface {
	id: string;
	label: string;
	description: string;
	software_id: string;
	job_type: 'srun' | 'sbatch';
	software_option_overrides?: Record<string, unknown>;
	extra_mounts?: string[];
}

export interface AppConfig {
	stages: Stage[];
	interfaces: ClusterInterface[];
}

async function fetchYaml<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw new Error(`Failed to load config: ${path} (${res.status})`);
	const text = await res.text();
	return yaml.load(text) as T;
}

export async function loadConfig(): Promise<AppConfig> {
	const [stagesData, interfacesData] = await Promise.all([
		fetchYaml<{ stages: Stage[] }>(`${base}/config/stages.yaml`),
		fetchYaml<{ interfaces: ClusterInterface[] }>(`${base}/config/interfaces.yaml`)
	]);
	return {
		stages: stagesData.stages,
		interfaces: interfacesData.interfaces
	};
}
