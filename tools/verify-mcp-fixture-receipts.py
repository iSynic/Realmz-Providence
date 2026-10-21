"""A later local draft edit must not rewrite a retained MCP reply or request."""
from mcp_test_client import Author


class Client:
    def tool(self, name, arguments):
        return {'structuredContent': {'draft': {'text': 'Original allocation'}}, 'content': []}


author = Author(Client())
arguments = {'draft': {'text': 'Original request'}}
result = author.call('fixture', arguments, guarded=False)
result['draft']['text'] = 'Locally edited draft'
arguments['draft']['text'] = 'Later request edit'
assert author.calls[0]['arguments']['draft']['text'] == 'Original request'
assert author.calls[0]['response']['structuredContent']['draft']['text'] == 'Original allocation'
print('PROVIDENCE_MCP_FIXTURE_RECEIPTS_OK local-draft-and-arguments-do-not-rewrite-retained-calls')
