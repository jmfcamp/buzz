import 'dart:convert';

const playgroundHula = 'playground';
const playgroundVersion = 1;
const openclawGatewayPort = 18789;
const browserDebugPorts = {9222, 9223, 9229, 9230, 5858};

class PlaygroundCard {
  const PlaygroundCard({
    required this.name,
    required this.url,
    required this.pin,
    required this.sid,
    this.stack,
    this.expires,
  });

  final String name;
  final String url;
  final String pin;
  final String sid;
  final String? stack;
  final Object? expires;
}

bool isAllowedPlaygroundUrl(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    return false;
  }
  if (uri.hasPort &&
      (uri.port == openclawGatewayPort ||
          browserDebugPorts.contains(uri.port))) {
    return false;
  }
  return true;
}

PlaygroundCard? parsePlaygroundCardValue(Object? value) {
  if (value is! Map) return null;
  if (value['hula'] != playgroundHula) return null;
  if (value['v'] != playgroundVersion) return null;
  final name = value['name'];
  final url = value['url'];
  final pin = value['pin'];
  final sid = value['sid'];
  if (name is! String || name.trim().isEmpty) return null;
  if (url is! String || !isAllowedPlaygroundUrl(url)) return null;
  if (pin is! String || pin.trim().isEmpty) return null;
  if (sid is! String || sid.trim().isEmpty) return null;
  final stack = value['stack'];
  final expires = value['expires'];
  return PlaygroundCard(
    name: name,
    url: url,
    pin: pin,
    sid: sid,
    stack: stack is String && stack.isNotEmpty ? stack : null,
    expires: expires is String || expires is num ? expires : null,
  );
}

PlaygroundCard? parsePlaygroundCard(String raw) {
  try {
    return parsePlaygroundCardValue(jsonDecode(raw.trim()));
  } catch (_) {
    return null;
  }
}
