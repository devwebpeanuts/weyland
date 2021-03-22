Hooks.once('init', () => {
    game.settings.register('weyland', 'flickering', {
        name: game.i18n.localize('WEYLAND.flickering'),
        hint: game.i18n.localize('WEYLAND.flickeringHint'),
        scope: 'client',
        type: Boolean,
        default: true,
        config: true,
        onChange: () => {
            location.reload();
        },
    })

    game.settings.register('weyland', 'screenDoor', {
        name: game.i18n.localize('WEYLAND.screenDoor'),
        hint: game.i18n.localize('WEYLAND.screenDoorHint'),
        scope: 'client',
        type: Boolean,
        default: true,
        config: true,
        onChange: () => {
            location.reload();
        },
    });

    game.settings.register('weyland', 'scanline', {
        name: game.i18n.localize('WEYLAND.scanline'),
        hint: game.i18n.localize('WEYLAND.scanlineHint'),
        scope: 'client',
        type: Boolean,
        default: true,
        config: true,
        onChange: () => {
            location.reload();
        },
    });
})

Hooks.once('ready', function() {
    if(game.settings.get('weyland', 'scanline')) {
        const scanline: JQuery<HTMLElement> = $('<div>').addClass('scanline');
        $('body').append(scanline)
    }

    if(game.settings.get('weyland', 'flickering')) {
        $('body').addClass('flickering')
    }

    if(game.settings.get('weyland', 'screenDoor')) {
        $('body').addClass('screen-door')
    }
})
