"""Exercise the real account components in the isolated visual preview."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    for width in [320, 390, 768, 940, 1280, 1440]:
        for theme in ['light', 'dark']:
            page.set_viewport_size({'width': width, 'height': 1000})
            page.goto('http://127.0.0.1:3011/', wait_until='networkidle')
            page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
            page.evaluate('document.fonts.ready')
            search = page.get_by_role('searchbox', name='Buscar sistemas')
            search.fill('crm')
            page.wait_for_function('document.querySelectorAll(".conta-sistema").length === 1')
            assert page.get_by_role('link', name='Abrir CRM', exact=True).is_visible()
            search.fill('automacao inexistente')
            page.get_by_text('Nenhum sistema encontrado', exact=True).wait_for()
            assert page.locator('.conta-sistema').count() == 0
            page.get_by_role('button', name='Limpar busca', exact=True).last.click()
            page.wait_for_function('document.querySelectorAll(".conta-sistema").length === 10')
            search.fill('ml.avilaops.com')
            page.wait_for_function('document.querySelectorAll(".conta-sistema").length === 1')
            assert page.get_by_role('link', name='Abrir Experiments', exact=True).is_visible()
            search.fill('operacao')
            page.wait_for_function('document.querySelectorAll(".conta-sistema").length === 1')
            search.fill('')
            page.wait_for_function('document.querySelectorAll(".conta-sistema").length === 10')
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (width, theme)
            page.locator('h1').click()
            page.screenshot(path=f'reports/conta-preview/v2-{theme}-{width}.png', full_page=True)
    page.goto('http://127.0.0.1:3011/vazio.html', wait_until='networkidle')
    assert page.locator('.conta-sistema').count() == 0
    assert page.locator('a[href="/admin"]').count() == 0
    assert page.locator('input[type=search]').count() == 0
    assert not errors, errors
    browser.close()
print('12 responsive/theme checks passed. Search, clear, empty states and hydration passed without browser errors.')
