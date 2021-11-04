import { TagChildrenAttributes } from './TagChildrenAttributes';
import { TaggableElement } from './TaggableElement';

/**
 * A TagChildrenElement is a TaggableElement already decorated with our ChildrenTaggingAttributes
 */
export type TagChildrenElement = TaggableElement & TagChildrenAttributes;
