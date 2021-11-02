import { assert, create, string } from 'superstruct';
import { ChildrenTaggingQueries } from '../../definitions/ChildrenTaggingQueries';
import { ValidChildrenTaggingQuery } from '../../definitions/ValidChildrenTaggingQuery';

/**
 * ChildrenTaggingAttribute stringifier
 */
export const stringifyChildrenTaggingAttribute = (queries: ChildrenTaggingQueries) => {
  if (!(typeof queries === 'object')) {
    throw new Error(`Visibility must be an object, received: ${JSON.stringify(queries)}`);
  }
  queries.forEach((query) => assert(query, ValidChildrenTaggingQuery));
  return create(JSON.stringify(queries), string());
};
