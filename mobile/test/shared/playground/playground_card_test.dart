import 'package:buzz/shared/playground/playground_card.dart';
import 'package:buzz/shared/playground/playground_card_widget.dart';
import 'package:buzz/shared/theme/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final valid = {
    'hula': 'playground',
    'v': 1,
    'name': 'Demo',
    'url': 'https://app.example.com',
    'pin': '1234',
    'sid': 'demo-1',
  };

  test('parses required playground fields and optional stack', () {
    final card = parsePlaygroundCardValue({...valid, 'stack': 'hula-app'});
    expect(card?.name, 'Demo');
    expect(card?.url, 'https://app.example.com');
    expect(card?.pin, '1234');
    expect(card?.sid, 'demo-1');
    expect(card?.stack, 'hula-app');
  });

  test('accepts missing or empty pin', () {
    final omitted = Map<String, Object>.from(valid)..remove('pin');
    expect(parsePlaygroundCardValue(omitted)?.sid, 'demo-1');
    expect(parsePlaygroundCardValue(omitted)?.pin, '');
    expect(parsePlaygroundCardValue({...valid, 'pin': ''})?.sid, 'demo-1');
    expect(parsePlaygroundCardValue({...valid, 'pin': '   '})?.pin, '');
  });

  test('rejects http, gateway, and debug ports', () {
    expect(
      parsePlaygroundCardValue({...valid, 'url': 'http://app.example.com'}),
      isNull,
    );
    expect(
      parsePlaygroundCardValue({
        ...valid,
        'url': 'https://app.example.com:18789',
      }),
      isNull,
    );
    expect(
      parsePlaygroundCardValue({
        ...valid,
        'url': 'https://app.example.com:9222',
      }),
      isNull,
    );
    expect(parsePlaygroundCard('{'), isNull);
  });

  testWidgets('renders name, url, PIN, and open-in-browser', (tester) async {
    final card = parsePlaygroundCardValue(valid);
    expect(card, isNotNull);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: PlaygroundCardWidget(card: card!)),
      ),
    );
    expect(find.text('Demo'), findsOneWidget);
    expect(find.text('https://app.example.com'), findsOneWidget);
    expect(find.text('PIN 1234'), findsOneWidget);
    expect(find.text('Open in browser'), findsOneWidget);
  });

  testWidgets('hides PIN when the card omits it', (tester) async {
    final omitted = Map<String, Object>.from(valid)..remove('pin');
    final card = parsePlaygroundCardValue(omitted);
    expect(card, isNotNull);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(body: PlaygroundCardWidget(card: card!)),
      ),
    );
    expect(find.textContaining('PIN'), findsNothing);
    expect(find.text('Open in browser'), findsOneWidget);
  });
}
