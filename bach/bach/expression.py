"""
Copyright 2021 Objectiv B.V.
"""
from abc import abstractmethod
from dataclasses import dataclass
from typing import Optional, Union, TYPE_CHECKING, List, Dict, Tuple
from sql_models.model import SqlModel, SqlModelSpec
from sql_models.util import quote_string, quote_identifier

if TYPE_CHECKING:
    from bach import Series
    from bach.sql_model import BachSqlModelBuilder


@dataclass(frozen=True)
class ExpressionToken:
    """ Abstract base class of ExpressionTokens"""

    def __post_init__(self):
        # Make sure that other code can rely on an ExpressionToken always being a subclass of this class.
        if self.__class__ == ExpressionToken:
            raise TypeError("Cannot instantiate ExpressionToken directly. Instantiate a subclass.")

    def to_sql(self):
        # Not abstract so we can stay a dataclass.
        raise NotImplementedError()


@dataclass(frozen=True)
class RawToken(ExpressionToken):
    raw: str

    def to_sql(self) -> str:
        return SqlModelSpec.escape_format_string(self.raw)


@dataclass(frozen=True)
class PlaceHolderToken(ExpressionToken):
    dtype: str
    name: str

    def to_sql(self) -> str:
        return '{' + self.name_to_sql(self.name) + '}'

    @classmethod
    def name_to_sql(cls, name: str) -> str:
        return '__bach_placeholder_' + f'{name}'


@dataclass(frozen=True)
class ColumnReferenceToken(ExpressionToken):
    column_name: str

    def to_sql(self):
        raise ValueError('ColumnReferenceTokens should be resolved first using '
                         'Expression.resolve_column_references')

    def resolve(self, table_name: Optional[str]) -> RawToken:
        t = f'{quote_identifier(table_name)}.' if table_name else ''
        return RawToken(f'{t}{quote_identifier(self.column_name)}')


@dataclass(frozen=True)
class ModelReferenceToken(ExpressionToken):
    model: SqlModel['BachSqlModelBuilder']

    def refname(self) -> str:
        return f'reference{self.model.hash}'

    def to_sql(self) -> str:
        return f'{{{self.refname()}}}'


@dataclass(frozen=True)
class StringValueToken(ExpressionToken):
    """ Wraps a string value. The value in this object is unescaped and unquoted. """
    value: str

    def to_sql(self) -> str:
        return SqlModelSpec.escape_format_string(quote_string(self.value))


@dataclass(frozen=True)
class VariableStringValueToken(ExpressionToken):
    value: str
    reference_name: str

    def to_sql(self) -> str:
        return SqlModelSpec.escape_format_string(quote_string(self.value))


class Expression:
    """
    Immutable object representing a fragment of SQL as a sequence of sql-tokens or Expressions.

    Expressions can easily be converted to a string with actual sql using the to_sql() function. Storing a
    sql-expression using this class, rather than storing it directly as a string, makes it possible to
    for example substitute the table-name after constructing the expression.
    Additionally this move this burden of correctly quoting and escaping string literals to this class, if
    literals are expressed with the correct tokens at least.
    In the future we might add support for more literal types.

    This class does not offer full-tokenization of sql. There are only a limited number of tokens for the
    needed use-cases. Most sql is simply encoded as a 'raw' token.

    For special type Expressions, this class is subclassed to assign special properties to a subexpression.
    """

    def __init__(self, data: Union['Expression', List[Union[ExpressionToken, 'Expression']]] = None):
        if not data:
            data = []
        if isinstance(data, Expression):
            # if we only got a base Expression, we absorb it.
            data = data.data if type(data) is Expression else [data]
        self._data: Tuple[Union[ExpressionToken, 'Expression'], ...] = tuple(data)

    @property
    def data(self) -> List[Union[ExpressionToken, 'Expression']]:
        return list(self._data)

    def __eq__(self, other):
        return isinstance(other, Expression) and self.data == other.data

    def __repr__(self):
        return f'{self.__class__}({repr(self.data)})'

    def __hash__(self):
        return hash(self._data)

    @classmethod
    def construct(cls, fmt: str, *args: Union['Expression', 'Series']) -> 'Expression':
        """
        Construct an Expression using a format string that can refer existing expressions.
        Every occurrence of `{}` in the fmt string will be replace with a provided expression (in order that
        they are given). All other parts of fmt will be converted to RawTokens.

        As a convenience, instead of Expressions it is also possible to give Series as args, in that
        case the series's expression is taken as Expression.

        :param fmt: format string
        :param args: 0 or more Expressions or Series. Number of args must exactly match number of `{}`
            occurrences in fmt.
        """

        sub_strs = fmt.split('{}')
        data: List[Union[ExpressionToken, Expression]] = []
        if len(args) != len(sub_strs) - 1:
            raise ValueError(f'For each {{}} in the fmt there should be an Expression provided. '
                             f'Found {{}}: {len(sub_strs) - 1}, provided expressions: {len(args)}')
        for i, sub_str in enumerate(sub_strs):
            if i > 0:
                arg = args[i - 1]
                if not isinstance(arg, Expression):  # arg is a Series
                    arg_expr = arg.expression
                else:
                    arg_expr = arg

                if isinstance(arg_expr, NonAtomicExpression):
                    data.extend([RawToken('('), arg_expr, RawToken(')')])
                else:
                    data.append(arg_expr)
            if sub_str != '':
                data.append(RawToken(raw=sub_str))
        return cls(data=data)

    @classmethod
    def raw(cls, raw: str) -> 'Expression':
        """ Return an expression that contains a single RawToken. """
        return cls([RawToken(raw)])

    @classmethod
    def placeholder(cls, dtype: str, name: str) -> 'Expression':
        """ Return an expression that contains a single RawToken. """
        return cls([PlaceHolderToken(dtype=dtype, name=name)])

    @classmethod
    def string_value(cls, value: str) -> 'Expression':
        """
        Return an expression that contains a single StringValueToken with the value.
        :param value: unquoted, unescaped string value.
        """
        return cls([StringValueToken(value)])

    @classmethod
    def column_reference(cls, field_name: str) -> 'Expression':
        """ Construct an expression for field-name, where field-name is a column in a table or CTE. """
        return cls([ColumnReferenceToken(field_name)])

    @classmethod
    def model_reference(cls, model: SqlModel['BachSqlModelBuilder']) -> 'Expression':
        """ Construct an expression for model, where model is a reference to a model. """
        return cls([ModelReferenceToken(model)])

    @property
    def is_single_value(self):
        """
        Will this expression return just one value (at most)

        Any Expression made up out of Tokens and Expressions, where all Expressions are single values,
        are expected to also yield a single value. Leaves consisting only of Tokens are considered
        not single valued, so at least one SingleValueExpression need to be present for a branch to
        become single valued.
        """
        if isinstance(self, SingleValueExpression):
            return True
        all_single_value = [d.is_single_value for d in self._data if isinstance(d, Expression)]
        return len(all_single_value) and all(all_single_value)

    @property
    def is_constant(self):
        """
        Does this expression represent a constant value, or an expressions constructed of only constants

        Any Expression made up out of Tokens and Expressions, where all Expressions are constant
        is considered constant. Leaves consisting only of Tokens are considered not constant, so
        at least one ConstValueExpressions need to be present for a branch to become constant.
        """
        if isinstance(self, ConstValueExpression):
            return True
        all_constant = [d.is_constant for d in self._data if isinstance(d, Expression)]
        return len(all_constant) and all(all_constant)

    @property
    def is_independent_subquery(self):
        return isinstance(self, IndependentSubqueryExpression)

    @property
    def has_aggregate_function(self) -> bool:
        """
        True iff we are a AggregateFunctionExpression, or there is at least one in this Expression.
        """
        return isinstance(self, AggregateFunctionExpression) or any(
            d.has_aggregate_function for d in self.data if isinstance(d, Expression)
        )

    @property
    def has_windowed_aggregate_function(self) -> bool:
        """
        True iff we are a WindowFunctionExpression, or there is at least one in this Expression.
        """
        return isinstance(self, WindowFunctionExpression) or any(
            d.has_windowed_aggregate_function for d in self.data if isinstance(d, Expression)
        )

    def resolve_column_references(self, table_name: str = None) -> 'Expression':
        """ resolve the table name aliases for all columns in this expression """
        result: List[Union[ExpressionToken, Expression]] = []
        for data_item in self.data:
            if isinstance(data_item, Expression):
                result.append(data_item.resolve_column_references(table_name))
            elif isinstance(data_item, ColumnReferenceToken):
                result.append(data_item.resolve(table_name))
            else:
                result.append(data_item)
        return self.__class__(result)

    def get_references(self) -> Dict[str, SqlModel['BachSqlModelBuilder']]:
        rv = {}
        for data_item in self.data:
            if isinstance(data_item, Expression):
                rv.update(data_item.get_references())
            elif isinstance(data_item, ModelReferenceToken):
                rv[data_item.refname()] = data_item.model
        return rv

    def get_all_tokens(self) -> List[ExpressionToken]:
        result = []
        for data_item in self.data:
            if isinstance(data_item, Expression):
                result.extend(data_item.get_all_tokens())
            else:
                result.append(data_item)
        return result

    # def get_constants(self) -> List['ConstValueExpression']:
    #     result = []
    #     for data_item in self.data:
    #         if isinstance(data_item, ConstValueExpression):
    #            result.append(data_item)
    #         elif isinstance(data_item, Expression):
    #             result.extend(data_item.get_constants())
    #     return result

    def to_sql(self, table_name: Optional[str] = None) -> str:
        """
        Compile the expression to a SQL fragment by calling to_sql() on every token or expression in data
        :param table_name: Optional table name, if set all column-references will be compiled as
            '"{table_name}"."{column_name}"' instead of just '"{column_name}"'.
        :return SQL representation of the expression.
        """
        return ''.join([d.to_sql() for d in self.resolve_column_references(table_name).data])


class NonAtomicExpression(Expression):
    """
    An expression that needs '( .. )' around it when used together with other Expressions
    in Expression.construct(). This subclass is required, because not all Expressions need to be wrapped
    in parenthesis, e.g. `expression` `<` `ANY (subquery)` should probably have `expression` wrapped if it's
    a complex expression, but not the `ANY ...` part, since that would not be valid SQL.
    """
    pass


class IndependentSubqueryExpression(Expression):
    pass


class SingleValueExpression(Expression):
    """
    An Expression that is expected to return just one value.
    If wrapped around IndependentSubqueryExpression, this will still have is_independent_subquery == True
    """
    @property
    def is_independent_subquery(self) -> bool:
        # If this Expression is wrapped around a IndependentSubqueryExpression, most likely, there will be
        # just one in here, but let's make sure.
        all_isq = [d.is_independent_subquery for d in self._data if isinstance(d, Expression)]
        return len(all_isq) > 0 and all(all_isq)


class ConstValueExpression(SingleValueExpression):
    def __init__(
            self,
            data: Union['Expression', List[Union[ExpressionToken, 'Expression']]] = None,
            name: Optional[str] = None
    ):
        super().__init__(data)
        self.name = name


class AggregateFunctionExpression(Expression):
    @property
    def is_constant(self) -> bool:
        # We don't consider an aggregate function constant even if all its subexpressions are,
        # because it requires materialization of the aggregation to actually be a constant value again.
        # Maybe we will revisit this some day. If that day comes, make sure to look at Series.count() as well.
        return False


class WindowFunctionExpression(Expression):
    """
    A WindowFunctionExpression contains an aggregation- or window function, and a window clause:
    e.g. agg_func() OVER (...). The agg_func. It's not a subclass of AggregateFunctionExpression because
    a window expression makes sense without the main query having a GROUP BY clause, as the partitioning
    is contained within the expression.

    """
    @property
    def is_constant(self) -> bool:
        # We don't consider an window expression constant even if all its subexpressions are,
        # because it requires materialization to actually be a constant value again.
        # Maybe we will revisit this some day. If that day comes, make sure to look at Series.count() as well.
        return False

    @property
    def has_aggregate_function(self) -> bool:
        # If a window expression contains an aggregate function, it's not an aggregate expression
        return False
