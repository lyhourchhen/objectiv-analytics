"""
Copyright 2021 Objectiv B.V.
"""
import re
from copy import copy
from typing import NamedTuple, Dict, List, Set

from sqlalchemy.engine import Engine

from bach import DataFrame
from sql_models.model import Materialization, SqlModel, CustomSqlModelBuilder
from sql_models.sql_generator import to_sql_materialized_nodes
from sql_models.util import quote_identifier


class SavepointEntry(NamedTuple):
    """
    Class to represent a savepoint
    """
    name: str
    df_original: 'DataFrame'
    materialization: Materialization
    written_to_db: Set[str]


class CreatedObject(NamedTuple):
    """
    Class representing a created database object (view/table)
    """
    name: str
    materialization: Materialization


class SqlExecutionResult(NamedTuple):
    """
    TODO
    """
    created: List[CreatedObject]
    data: Dict[str, List[tuple]]


class Savepoints:
    """
    Class to store a collection of savepoints. A savepoint represents the state of a DataFrame instance at
    the moment it is being added to a Savepoints object.

    Functionality:
    - Converted the savepoints to SQL using :meth:`Savepoints.to_sql()`
    - Materialized as tables or views in a database using :meth:`Savepoints.write_to_databse()`.
    - TODO: serialized to a file, and later restored by deserializing
    - TODO: exported as a DBT project
    - TODO: exported to BI tools
    """

    def __init__(self):
        self._entries: Dict[str, SavepointEntry] = {}

    def merge(self, other: 'Savepoints'):
        """
        INTERNAL
        Update this Savepoints object by adding all savepoints from other.
        """
        for name, entry in other._entries.items():
            if name in self._entries:
                existing = self._entries[name]
                if existing.df_original != entry.df_original \
                        or existing.materialization != entry.materialization:
                    raise ValueError(f'Conflicting savepoints. The savepoint "{name}" exists in both '
                                     f'Savepoints objects, but is different.')
                existing.written_to_db.update(entry.written_to_db)
            else:
                self._entries[name] = SavepointEntry(
                    name=name,
                    df_original=entry.df_original.copy(),
                    materialization=entry.materialization,
                    written_to_db=copy(entry.written_to_db)
                )

    def add_savepoint(self, name: str, df: DataFrame, materialization: Materialization):
        """
        Add the DataFrame as a savepoint.

        Generally one would use :py:meth:`bach.DataFrame.set_savepoint()`
        """
        if name is None or not re.match('^[a-zA-Z0-9_]+$', name):
            raise ValueError(f'Name must match ^[a-zA-Z0-9_]+$, name: "{name}"')
        if name in self._entries:
            existing = self._entries[name]
            if existing.df_original != df or existing.materialization != materialization:
                raise ValueError(f'A different savepoint with the name "{name}" already exists.')
            # Nothing to do, we already have this entry
            return
        self._entries[name] = SavepointEntry(
            name=name,
            df_original=df.copy(),
            materialization=materialization,
            written_to_db=set()
        )

    def update_savepoint(self, name: str, materialization: Materialization):
        """

        NOTE: This does not undo any side-effects from earlier called function, such as :meth:`execute_sql()`
            i.e. if materialization was 'table' before and is changed to 'view', then an existing table in
            the database is not updated.
        """
        current = self._entries[name]
        if current.materialization == materialization:
            return
        self._entries[name] = SavepointEntry(
            name=current.name,
            df_original=current.df_original,
            materialization=materialization,
            written_to_db=set()
        )

    def remove_savepoint(self, name: str):
        """
        Discard the savepoint.
        NOTE: This does not undo any side-effects from earlier called function, such as :meth:`execute_sql()`
        """
        del self._entries[name]

    def get_df(self, savepoint_name: str) -> 'DataFrame':
        """
        Return a copy of the original DataFrame that was saved with the given name.
        """
        return self._entries[savepoint_name].df_original.copy()

    def get_materialized_df(self, engine: Engine, savepoint_name: str) -> 'DataFrame':
        """
        Return the DataFrame that was saved with the given name, but with an updated base_node.
        The updated base_node assumes that :meth:`execute_sql()` has been executed. Where possible it
        will query one of the created tables or views, instead of the original source tables.
        """
        info = self._entries[savepoint_name]
        if engine.url not in info.written_to_db:
            raise ValueError(f'Savepoint "{savepoint_name}" has not been materialized with the given '
                             f'engine.url ({engine.url}). '
                             f'Use get_df() to get the original DataFrame, or materialize the savepoint in '
                             f'a database by calling execute_sql().')
        full_graph = self._get_combined_graph()
        graph = full_graph.references[f'ref_{info.name}']
        return info.df_original\
            .copy_override_base_node(base_node=graph)\
            .copy_override(engine=engine)

    @property
    def all(self) -> List[SavepointEntry]:
        return list(self._entries.values())

    @property
    def names(self) -> List[str]:
        return [entry.name for entry in self._entries.values()]

    def execute_sql(self, engine: Engine, overwrite: bool = False) -> SqlExecutionResult:
        """

        """
        sql_statements = self.to_sql()
        result_created = []
        result_data = {}

        with engine.connect() as conn:
            with conn.begin() as transaction:
                if overwrite:
                    # This is a bit fragile. Drop statements might fail if other objects (which we might not
                    # consider) depend on a view/table, or if the object type (view/table) is different than
                    # we assume. For now that's just the way it is, the user will get an error.
                    drop_statements = self.get_drop_statements()
                    if drop_statements:
                        drop_sql = '; '.join(drop_statements.values())
                        conn.execute(drop_sql)

                for name, statement in sql_statements.items():
                    info = self._entries[name]
                    query_result = conn.execute(statement)
                    if info.materialization == Materialization.QUERY:
                        # We return the combined result of all sql statements with QUERY materialization
                        # TODO: change format so it includes column names?
                        #  Perhaps return full pandas DFs, similar to what to_pandas() does?
                        result_data[name] = list(query_result)
                    elif info.materialization in (Materialization.TABLE, Materialization.VIEW):
                        result_created.append(CreatedObject(name=name, materialization=info.materialization))
                    info.written_to_db.add(engine.url)
                transaction.commit()
        return SqlExecutionResult(
            created=result_created,
            data=result_data
        )

    def get_drop_statements(self) -> Dict[str, str]:
        """
        Get the drop statements to remove all savepoints that are marked as table or view.
        The returned dictionary is sorted, such that depending tables/views are deleted before dependencies.
        :return: dict with as key the savepoint name, and as value the drop statement for that table/view
        """
        sql_statements = self.to_sql()
        drop_statements = {}
        for name in reversed(sql_statements.keys()):
            info = self._entries[name]
            if info.materialization == Materialization.TABLE:
                drop_statements[name] = f'drop table if exists {quote_identifier(name)}'
            elif info.materialization == Materialization.VIEW:
                drop_statements[name] = f'drop view if exists {quote_identifier(name)}'
        return drop_statements

    def get_create_statements(self) -> Dict[str, str]:
        """
        Get the create statements to create savepoints that are marked as table or view.
        The returned dictionary is sorted, such that dependencies are created before tables/views that
        depend on them.
        :return: dict with as key the savepoint name, and as value the create statement for that table/view
        """
        sql_statements = self.to_sql()
        return {
            name: statement for name, statement in sql_statements.items()
            if self._entries[name].materialization in (Materialization.TABLE, Materialization.VIEW)
        }

    def to_sql(self) -> Dict[str, str]:
        """
        Generate the sql for all save-points
        :return: dictionary mapping the name of each savepoint to the sql for that savepoint.
        """
        graph = self._get_combined_graph()
        sqls = to_sql_materialized_nodes(start_node=graph, include_start_node=False)
        return sqls

    def _get_combined_graph(self) -> SqlModel:
        """
        Get a single graph that contains all savepoints.

        The savepoints are referred by the returned sql-model as 'ref_{name}'.
        """
        entries = list(self._entries.values())
        references: Dict[str, SqlModel] = {
            f'ref_{entry.name}': entry.df_original.base_node for entry in entries
        }
        # Create one graph with all entries
        graph = _get_virtual_node(references)

        # Now update all the nodes that represent an entry, to have the correct materialization
        for entry in entries:
            reference_path = (f'ref_{entry.name}', )
            graph = graph.set_materialization_name(reference_path, materialization_name=entry.name)
            graph = graph.set_materialization(reference_path, materialization=entry.materialization)
        return graph

    def __str__(self) -> str:
        """ Give string with overview of all savepoints per materialization. """
        tables = [entry for entry in self.all if entry.materialization == Materialization.TABLE]
        views = [entry for entry in self.all if entry.materialization == Materialization.VIEW]
        others = [entry for entry in self.all if entry.materialization
                  not in (Materialization.TABLE, Materialization.VIEW)]
        result = [f'Savepoint, entries: {len(self.all)}']
        result.append(f'\tTables, entries: {len(tables)}')
        for table in tables:
            result.append(f'\t\t{table.name}')
        result.append(f'\tViews, entries: {len(views)}')
        for view in views:
            result.append(f'\t\t{view.name}')
        result.append(f'\tOther, entries: {len(others)}')
        for other in others:
            result.append(f'\t\t{other.name}')
        string = '\n'.join(result)
        return string


def _get_virtual_node(references: Dict[str, SqlModel]) -> SqlModel:
    # TODO: move this to sqlmodel?
    # reference_sql is of form "{{ref_0}}, {{1}}, ..., {{n}}"
    reference_sql = ', '.join(f'{{{{{ref_name}}}}}' for ref_name in references.keys())
    sql = f'select * from {reference_sql}'
    return CustomSqlModelBuilder(name='virtual_node', sql=sql)\
        .set_materialization(Materialization.VIRTUAL_NODE)\
        .set_values(**references)\
        .instantiate()
