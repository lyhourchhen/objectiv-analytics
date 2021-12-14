"""
Copyright 2021 Objectiv B.V.
"""
from bach_open_taxonomy.stack.basic_features import BasicFeatures
from bach_open_taxonomy.stack.extracted_contexts import ExtractedContexts
from bach_open_taxonomy.stack.sessionized_data import SessionizedData
from sql_models.model import SqlModel


def _get_date_range(start_date, end_date):
    if start_date:
        if end_date:
            date_range = f"where day between '{start_date}' and '{end_date}'"
        else:
            date_range = f"where day >= '{start_date}'"
    else:
        if end_date:
            date_range = f"where day <= '{end_date}'"
        else:
            date_range = ''

    return date_range


def basic_feature_model(session_gap_seconds=1800, start_date=None, end_date=None) -> SqlModel:
    """ Give a linked BasicFeatures model"""
    date_range = _get_date_range(start_date, end_date)

    extracted_contexts = ExtractedContexts(date_range=date_range)
    return BasicFeatures.build(
        sessionized_data=SessionizedData(
            session_gap_seconds=session_gap_seconds,
            extracted_contexts=extracted_contexts
        )
    )


def sessionized_data_model(session_gap_seconds=1800, start_date=None, end_date=None) -> SqlModel:
    """ Give a linked SessionizedData model"""
    date_range = _get_date_range(start_date, end_date)

    extracted_contexts = ExtractedContexts(date_range=date_range)
    return SessionizedData.build(
            session_gap_seconds=session_gap_seconds,
            extracted_contexts=extracted_contexts
        )
