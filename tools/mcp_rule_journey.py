"""Native rule authoring through the real MCP client; no source-row replacement."""
from copy import deepcopy


def run(author):
    for kind in ['race', 'caste']:
        _family(author, kind)
    author.call('providence_project_save', {'operationId': 'checkpoint-rules'})
    author.call('providence_project_close', guarded=False)
    author.call('providence_project_open', {'path': 'scenario'}, guarded=False)
    for kind in ['race', 'caste']:
        rows = author.call('providence_rule_catalog', {'kind': kind, 'scope': 'scenario'})['items']
        assert any(row['name'] == 'Café ' + kind for row in rows)
    author.call('providence_history_undo', {'operationId': 'undo-reopened-rule-clear'})
    author.call('providence_history_redo', {'operationId': 'redo-reopened-rule-clear'})


def _family(author, kind):
    catalog = author.call('providence_rule_catalog', {'kind': kind, 'source': 'authoring'})
    assert catalog['total'] == 30
    reviewed = author.call('providence_rule_allocation_review', {'kind': kind})
    draft = reviewed['draft']
    number = draft['edit']['definition']['classicId']
    assert reviewed['authorId'] == number - 1
    definition = draft['edit']['definition']
    definition.update(name='Café ' + kind, description='  Native project note  ')
    if kind == 'race':
        definition['baseMovement'] = 3
        definition['eligibleCasteIds'] = [
            author.call('providence_rule_catalog', {'kind': 'caste'})['items'][0]['identity']]
    else:
        definition['eligibleRaceIds'] = [
            author.call('providence_rule_catalog', {'kind': 'race'})['items'][0]['identity']]
        draft['edit']['nativeFields']['maximumSpellsPerRound'] = 3
        draft['edit']['nativeFields']['startingItems'][0] = 'classic.item.901'
        definition['startingItemIds'] = ['classic.item.901']
    assert author.call('providence_rule_draft_prepare', {'draft': draft})['valid']
    preview = author.call('providence_rule_draft_apply', {'draft': draft})
    assert author.call('providence_rule_open_authoring', {
        'kind': kind, 'classicId': number})['ownership'] == 'vacant'
    author.commit(preview, 'allocate-' + kind)
    opened = _opened(author, kind, number)
    assert opened['authorId'] == number - 1 and opened['ownership'] == 'scenario'
    assert opened['draft']['edit']['definition']['name'] == definition['name']
    if kind == 'caste':
        assert opened['draft']['edit']['nativeFields']['maximumSpellsPerRound'] == 3
        assert opened['draft']['edit']['nativeFields']['startingItems'][0] == 'classic.item.901'
        assert not opened['maximumSpellsRuntimeSupported']
    assert not author.call('providence_rule_draft_prepare', {'draft': draft})['valid']
    author.call('providence_rule_used_by', {'kind': kind, 'classicId': number})
    author.call('providence_history_undo', {'operationId': 'undo-allocate-' + kind})
    assert _opened(author, kind, number)['ownership'] == 'vacant'
    author.call('providence_history_redo', {'operationId': 'redo-allocate-' + kind})
    opened = _opened(author, kind, number)
    _copy_and_clear(author, kind, number, opened)
    _reject_unowned(author, kind, number)


def _copy_and_clear(author, kind, number, opened):
    name = opened['draft']['edit']['definition']['name']
    copied = author.call('providence_rule_allocation_review', {
        'kind': kind, 'copySource': opened['copySource']})
    copy_number = copied['draft']['edit']['definition']['classicId']
    assert copy_number != number
    assert copied['draft']['edit']['definition']['name'] == name
    author.group([{'name': 'copy', 'tool': 'providence_rule_draft_apply',
                   'arguments': {'draft': copied['draft']}}], 'copy-' + kind)
    clear = author.call('providence_rule_clear_review', {'kind': kind, 'classicId': copy_number})
    assert clear['identityRetained']
    author.group([{'name': 'clear', 'tool': 'providence_rule_draft_apply',
                   'arguments': {'draft': clear['draft']}}], 'clear-copy-' + kind)
    reset = _opened(author, kind, copy_number)
    assert reset['draft']['edit'] == clear['draft']['edit']
    assert reset['identity'] == copied['destination']
    author.call('providence_history_undo', {'operationId': 'undo-clear-copy-' + kind})
    assert _opened(author, kind, copy_number)['draft']['edit']['definition']['name'] == name
    author.call('providence_history_redo', {'operationId': 'redo-clear-copy-' + kind})


def _reject_unowned(author, kind, number):
    current = _opened(author, kind, number)['draft']
    unowned = deepcopy(current)
    unowned['edit']['definition']['sourceBlob'] = 'unowned'
    author.call('providence_rule_draft_apply', {'draft': unowned}, expect_error=True)
    assert _opened(author, kind, number)['draft'] == current


def _opened(author, kind, number):
    return author.call('providence_rule_open_authoring', {'kind': kind, 'classicId': number})
