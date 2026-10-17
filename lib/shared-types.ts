import type {State} from './inventory';
import type {Valuation} from './valuation-types';
import type {TeamMember} from './team-access';
export type SharedMember=Omit<TeamMember,'userId'>;
export type SharedSnapshot={role:'viewer';readOnly:true;state:State;revision:number;valuation:Valuation;members:SharedMember[]};
