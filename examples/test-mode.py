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
result = client.create(definition)['result']
assert client.get(result['id'])['envelope']['testMode'] is True
assert len(client.artifact(result['id'], 'original')) > 0
assert any(e['id'] == result['id'] for e in client.list()['envelopes'])
client.send(result['id'])
client.correct(result['id'], {'signers': [dict(definition['signers'][0], email='synthetic.corrected@clients.example')]})
client.resend(result['id'], {'signer': 0})
client.templates()
client.openapi()
client.void(result['id'], 'Synthetic example complete')
print('Python test-mode example passed')
