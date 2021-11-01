"""
Copyright 2021 Objectiv B.V.
"""
import datetime
from typing import Union, cast, TYPE_CHECKING

import numpy

from buhtuh import BuhTuhDataFrame
from buhtuh.series import BuhTuhSeries, BuhTuhSeriesString, const_to_series
from buhtuh.expression import Expression
from buhtuh.series.series import WrappedPartition

if TYPE_CHECKING:
    from buhtuh.partitioning import BuhTuhGroupBy


class BuhTuhSeriesTimestamp(BuhTuhSeries):
    """
    Types in PG that we want to support: https://www.postgresql.org/docs/9.1/datatype-datetime.html
        timestamp without time zone
    """
    dtype = 'timestamp'
    dtype_aliases = ('datetime64', 'datetime64[ns]', numpy.datetime64)
    supported_db_dtype = 'timestamp without time zone'
    supported_value_types = (datetime.datetime, datetime.date, str)

    @classmethod
    def supported_value_to_expression(cls, value: Union[str, datetime.datetime]) -> Expression:
        value = str(value)
        # TODO: check here already that the string has the correct format
        return Expression.construct(
            'cast({} as timestamp without time zone)', Expression.string_value(value)
        )

    @classmethod
    def dtype_to_expression(cls, source_dtype: str, expression: Expression) -> Expression:
        if source_dtype == 'timestamp':
            return expression
        else:
            if source_dtype not in ['string', 'date']:
                raise ValueError(f'cannot convert {source_dtype} to timestamp')
            return Expression.construct(f'cast({{}} as {cls.supported_db_dtype})', expression)

    def _comparator_operator(self, other, comparator):
        other = const_to_series(base=self, value=other)
        self._check_supported(f"comparator '{comparator}'", ['timestamp', 'date', 'string'], other)
        expression = Expression.construct(f'({{}}) {comparator} ({{}})', self, other)
        return self.copy_override(dtype='bool', expression=expression)

    def format(self, format) -> BuhTuhSeriesString:
        """
        Allow standard PG formatting of this Series (to a string type)

        :param format: The format as defined in https://www.postgresql.org/docs/14/functions-formatting.html
        :return: a derived Series that accepts and returns formatted timestamp strings
        """
        expression = Expression.construct(f"to_char({{}}, '{format}')", self)
        return self.copy_override(dtype='string', expression=expression)

    def __sub__(self, other) -> 'BuhTuhSeriesTimestamp':
        other = const_to_series(base=self, value=other)
        self._check_supported('sub', ['timestamp', 'date', 'time'], other)
        expression = Expression.construct('({}) - ({})', self, other)
        return self.copy_override(dtype='timedelta', expression=expression)


class BuhTuhSeriesDate(BuhTuhSeriesTimestamp):
    """
    Types in PG that we want to support: https://www.postgresql.org/docs/9.1/datatype-datetime.html
        date
    """
    dtype = 'date'
    dtype_aliases = tuple()  # type: ignore
    supported_db_dtype = 'date'
    supported_value_types = (datetime.datetime, datetime.date, str)

    @classmethod
    def supported_value_to_expression(cls, value: Union[str, datetime.date]) -> Expression:
        if isinstance(value, datetime.date):
            value = str(value)
        # TODO: check here already that the string has the correct format
        return Expression.construct(f'cast({{}} as date)', Expression.string_value(value))

    @classmethod
    def dtype_to_expression(cls, source_dtype: str, expression: Expression) -> Expression:
        if source_dtype == 'date':
            return expression
        else:
            if source_dtype not in ['string', 'timestamp']:
                raise ValueError(f'cannot convert {source_dtype} to date')
            return Expression.construct(f'cast({{}} as {cls.supported_db_dtype})', expression)


class BuhTuhSeriesTime(BuhTuhSeries):
    """
    Types in PG that we want to support: https://www.postgresql.org/docs/9.1/datatype-datetime.html
        time without time zone
    """
    dtype = 'time'
    dtype_aliases = tuple()  # type: ignore
    supported_db_dtype = 'time without time zone'
    supported_value_types = (datetime.time, str)

    @classmethod
    def supported_value_to_expression(cls, value: Union[str, datetime.time]) -> Expression:
        value = str(value)
        # TODO: check here already that the string has the correct format
        return Expression.construct('cast({} as time without time zone)', Expression.string_value(value))

    @classmethod
    def dtype_to_expression(cls, source_dtype: str, expression: Expression) -> Expression:
        if source_dtype == 'time':
            return expression
        else:
            if source_dtype not in ['string', 'timestamp']:
                raise ValueError(f'cannot convert {source_dtype} to time')
            return Expression.construct(f'cast ({{}} as {cls.supported_db_dtype})', expression)

    def _comparator_operator(self, other, comparator):
        from buhtuh.series import const_to_series
        other = const_to_series(base=self, value=other)
        self._check_supported(f"comparator '{comparator}'", ['time', 'string'], other)
        expression = Expression.construct(f'({{}}) {comparator} ({{}})', self, other)
        return self.copy_override(dtype='bool', expression=expression)


class BuhTuhSeriesTimedelta(BuhTuhSeries):
    dtype = 'timedelta'
    dtype_aliases = ('interval',)
    supported_db_dtype = 'interval'
    supported_value_types = (datetime.timedelta, numpy.timedelta64, str)

    @classmethod
    def supported_value_to_expression(
            cls,
            value: Union[str, numpy.timedelta64, datetime.timedelta]
    ) -> Expression:
        value = str(value)
        # TODO: check here already that the string has the correct format
        return Expression.construct('cast({} as interval)', Expression.string_value(value))

    @classmethod
    def dtype_to_expression(cls, source_dtype: str, expression: Expression) -> Expression:
        if source_dtype == 'timedelta':
            return expression
        else:
            if not source_dtype == 'string':
                raise ValueError(f'cannot convert {source_dtype} to timedelta')
            return Expression.construct('cast({} as interval)', expression)

    def _comparator_operator(self, other, comparator):
        other = const_to_series(base=self, value=other)
        self._check_supported(f"comparator '{comparator}'", ['timedelta', 'date', 'time', 'string'], other)
        expression = Expression.construct(f'({{}}) {comparator} ({{}})', self, other)
        return self.copy_override(dtype='bool', expression=expression)

    def format(self, format) -> BuhTuhSeriesString:
        """
        Allow standard PG formatting of this Series (to a string type)

        :param format: The format as defined in https://www.postgresql.org/docs/9.1/functions-formatting.html
        :return: a derived Series that accepts and returns formatted timestamp strings
        """
        expression = Expression.construct(f"to_char({{}}, '{format}')", self)
        return self.copy_override(dtype='string', expression=expression)

    def __add__(self, other) -> 'BuhTuhSeriesTimedelta':
        other = const_to_series(base=self, value=other)
        self._check_supported('add', ['timedelta', 'timestamp', 'date', 'time'], other)
        expression = Expression.construct('({}) + ({})', self, other)
        return self.copy_override(dtype='timedelta', expression=expression)

    def __sub__(self, other) -> 'BuhTuhSeriesTimedelta':
        other = const_to_series(base=self, value=other)
        self._check_supported('sub', ['timedelta', 'timestamp', 'date', 'time'], other)
        expression = Expression.construct('({}) - ({})', self, other)
        return self.copy_override(dtype='timedelta', expression=expression)

    def sum(self, partition: WrappedPartition = None,
            skipna: bool = True, min_count: int = None) -> 'BuhTuhSeriesTimedelta':
        result = self._derived_agg_func(
            partition=partition,
            expression=Expression.construct('sum({})', self.expression),
            skipna=skipna,
            min_count=min_count
        )
        return cast('BuhTuhSeriesTimedelta', result)

    def mean(self, partition: WrappedPartition = None, skipna: bool = True) -> 'BuhTuhSeriesTimedelta':
        result = self._derived_agg_func(
            partition=partition,
            expression=Expression.construct('avg({})', self.expression),
            skipna=skipna
        )
        return cast('BuhTuhSeriesTimedelta', result)
