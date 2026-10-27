"""Server-side Inkwell client using the Python standard library. No automatic mutation retries."""
import json
import uuid
from urllib.parse import urlsplit, urlencode, quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class Inkwell:
    def __init__(self, origin, key):
        url = urlsplit(origin)
        if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1', '::1')):
            raise ValueError('Use HTTPS for the installation origin.')
        self.origin = f'{url.scheme}://{url.netloc}'
        self.key = key
        self.transport = build_opener(NoRedirect)

    def request(self, path, method='GET', body=None, binary=False):
        if not path.startswith('/api/v1/') or '://' in path:
            raise ValueError('Use a relative public API path.')
        headers = {'Authorization': 'Bearer ' + self.key}
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        with self.transport.open(Request(self.origin + path, data=data, headers=headers, method=method), timeout=30) as response:
            result = response.read()
            return result if binary else json.loads(result)

    def list(self, **query):
        return self.request('/api/v1/envelopes?' + urlencode(query))

    def get(self, envelope_id):
        return self.request('/api/v1/envelopes/' + quote(envelope_id, safe=''))

    def create(self, definition, command_id=None):
        return self.request('/api/v1/envelopes', 'POST', dict(definition, commandId=command_id or str(uuid.uuid4())))

    def mutate(self, envelope_id, action, data, command_id=None):
        return self.request('/api/v1/envelopes/' + quote(envelope_id, safe='') + '/' + action, 'POST', dict(data, commandId=command_id or str(uuid.uuid4())))

    def send(self, envelope_id, command_id=None, **options):
        return self.mutate(envelope_id, 'send', options, command_id)

    def correct(self, envelope_id, data, command_id=None):
        return self.mutate(envelope_id, 'correct', data, command_id)

    def resend(self, envelope_id, data, command_id=None):
        return self.mutate(envelope_id, 'resend', data, command_id)

    def void(self, envelope_id, reason, command_id=None):
        return self.mutate(envelope_id, 'void', {'reason': reason}, command_id)

    def artifact(self, envelope_id, kind):
        return self.request('/api/v1/envelopes/' + quote(envelope_id, safe='') + '/artifacts/' + quote(kind, safe=''), binary=True)

    def templates(self, **query):
        return self.request('/api/v1/templates?' + urlencode(query))

    def openapi(self):
        return self.request('/api/v1/openapi.json')
