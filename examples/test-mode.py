import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sdk' / 'python'))
from inkwell import Inkwell
if not os.environ['INKWELL_TEST_KEY'].startswith('iwk_test_'):
    raise ValueError('Use a test-mode key.')
client = Inkwell(os.environ['INKWELL_ORIGIN'], os.environ['INKWELL_TEST_KEY'])
definition = json.loads(Path(sys.argv[1]).read_text())
templates = client.templates()
assert [t['id'] for t in templates['templates']] == [os.environ['INKWELL_TEMPLATE_ID']]
spec = client.openapi()
assert spec['openapi'].startswith('3.')
paths = {}
for name, method in [('listEnvelopes', 'get'), ('prepareEnvelope', 'post'), ('readEnvelope', 'get'), ('downloadArtifact', 'get'), ('listTemplates', 'get'), ('sendEnvelope', 'post'), ('correctEnvelope', 'post'), ('resendInvitation', 'post'), ('voidEnvelope', 'post')]:
    entries = [(path, verbs[method]) for path, verbs in spec['paths'].items() if verbs.get(method, {}).get('operationId') == name]
    assert len(entries) == 1, f'OpenAPI describes usable {name}'
    path, operation = entries[0]
    assert '200' in operation['responses']
    paths[name] = path
assert [t['id'] for t in client.request(paths['listTemplates'])['templates']] == [os.environ['INKWELL_TEMPLATE_ID']]
result = client.create(definition)['result']
assert client.get(result['id'])['envelope']['testMode'] is True
assert len(client.artifact(result['id'], 'original')) > 0
assert any(e['id'] == result['id'] for e in client.list()['envelopes'])
assert any(e['id'] == result['id'] for e in client.request(paths['listEnvelopes'])['envelopes'])
client.send(result['id'])
assert client.get(result['id'])['envelope']['status'] == 'awaiting_signature'
client.correct(result['id'], {'signers': [dict(definition['signers'][0], email='synthetic.corrected@clients.example')]})
assert client.get(result['id'])['envelope']['signers'][0]['email'] == 'synthetic.corrected@clients.example'
before = sum(e['action'] == 'signer.resent' for e in client.get(result['id'])['envelope']['events'])
client.resend(result['id'], {'signer': 0})
assert sum(e['action'] == 'signer.resent' for e in client.get(result['id'])['envelope']['events']) == before + 1
client.void(result['id'], 'Synthetic example complete')
assert client.get(result['id'])['envelope']['status'] == 'voided'
print('Python test-mode example passed')
