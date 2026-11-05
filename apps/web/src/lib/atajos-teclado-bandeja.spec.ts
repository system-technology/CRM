import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CATALOGO_ATAJOS_BANDEJA,
  CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA,
  calcularSiguienteConversacionId,
  debeProcesarAtajo,
  esElementoEditable,
  fijarAtajosHabilitados,
  sonAtajosHabilitados,
} from './atajos-teclado-bandeja';

describe('atajos-teclado-bandeja (T-127)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('esElementoEditable', () => {
    it('reconoce inputs, textareas y selects como elementos editables', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');

      expect(esElementoEditable(input)).toBe(true);
      expect(esElementoEditable(textarea)).toBe(true);
      expect(esElementoEditable(select)).toBe(true);
    });

    it('reconoce elementos con contenteditable o role="textbox"', () => {
      const divContentEditable = document.createElement('div');
      divContentEditable.setAttribute('contenteditable', 'true');

      const spanRoleTextbox = document.createElement('span');
      spanRoleTextbox.setAttribute('role', 'textbox');

      const searchRole = document.createElement('div');
      searchRole.setAttribute('role', 'searchbox');

      expect(esElementoEditable(divContentEditable)).toBe(true);
      expect(esElementoEditable(spanRoleTextbox)).toBe(true);
      expect(esElementoEditable(searchRole)).toBe(true);
    });

    it('no marca botones, divs comunes o el body como editables', () => {
      const div = document.createElement('div');
      const btn = document.createElement('button');
      const a = document.createElement('a');

      expect(esElementoEditable(div)).toBe(false);
      expect(esElementoEditable(btn)).toBe(false);
      expect(esElementoEditable(a)).toBe(false);
      expect(esElementoEditable(null)).toBe(false);
    });
  });

  describe('Preferencias de atajos en localStorage', () => {
    it('retorna true por defecto si no hay valor previo guardado', () => {
      expect(sonAtajosHabilitados()).toBe(true);
    });

    it('persiste y lee correctamente cuando se desactivan los atajos', () => {
      fijarAtajosHabilitados(false);
      expect(localStorage.getItem(CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA)).toBe('false');
      expect(sonAtajosHabilitados()).toBe(false);

      fijarAtajosHabilitados(true);
      expect(localStorage.getItem(CLAVE_LOCALSTORAGE_ATAJOS_BANDEJA)).toBe('true');
      expect(sonAtajosHabilitados()).toBe(true);
    });
  });

  describe('debeProcesarAtajo', () => {
    it('rechaza cualquier atajo si las preferencias los tienen deshabilitados', () => {
      const btn = document.createElement('button');
      const ev = new KeyboardEvent('keydown', { key: 'j' });
      Object.defineProperty(ev, 'target', { value: btn });

      expect(debeProcesarAtajo(ev, false)).toBe(false);
    });

    it('rechaza atajos cuando el foco está dentro de un campo de texto', () => {
      const input = document.createElement('input');
      const ev = new KeyboardEvent('keydown', { key: 'r' });
      Object.defineProperty(ev, 'target', { value: input });

      expect(debeProcesarAtajo(ev, true)).toBe(false);
    });

    it('rechaza atajos si vienen con modificadores Ctrl, Meta o Alt', () => {
      const div = document.createElement('div');
      const evCtrl = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true });
      const evAlt = new KeyboardEvent('keydown', { key: 'r', altKey: true });
      const evMeta = new KeyboardEvent('keydown', { key: 'r', metaKey: true });

      Object.defineProperty(evCtrl, 'target', { value: div });
      Object.defineProperty(evAlt, 'target', { value: div });
      Object.defineProperty(evMeta, 'target', { value: div });

      expect(debeProcesarAtajo(evCtrl, true)).toBe(false);
      expect(debeProcesarAtajo(evAlt, true)).toBe(false);
      expect(debeProcesarAtajo(evMeta, true)).toBe(false);
    });

    it('acepta atajos válidos ejecutados fuera de campos de texto', () => {
      const div = document.createElement('div');
      const evJ = new KeyboardEvent('keydown', { key: 'j' });
      Object.defineProperty(evJ, 'target', { value: div });

      expect(debeProcesarAtajo(evJ, true)).toBe(true);
    });
  });

  describe('calcularSiguienteConversacionId', () => {
    const lista = [{ id: 'conv-1' }, { id: 'conv-2' }, { id: 'conv-3' }];

    it('retorna null si la lista de conversaciones está vacía', () => {
      expect(calcularSiguienteConversacionId([], null, 'siguiente')).toBeNull();
    });

    it('si no hay id actual, retorna la primera conversación tanto para siguiente como para anterior', () => {
      expect(calcularSiguienteConversacionId(lista, null, 'siguiente')).toBe('conv-1');
      expect(calcularSiguienteConversacionId(lista, undefined, 'anterior')).toBe('conv-1');
    });

    it('avanza a la siguiente conversación con "siguiente" sin desbordar el final', () => {
      expect(calcularSiguienteConversacionId(lista, 'conv-1', 'siguiente')).toBe('conv-2');
      expect(calcularSiguienteConversacionId(lista, 'conv-2', 'siguiente')).toBe('conv-3');
      expect(calcularSiguienteConversacionId(lista, 'conv-3', 'siguiente')).toBe('conv-3');
    });

    it('retrocede a la conversación anterior con "anterior" sin desbordar el inicio', () => {
      expect(calcularSiguienteConversacionId(lista, 'conv-3', 'anterior')).toBe('conv-2');
      expect(calcularSiguienteConversacionId(lista, 'conv-2', 'anterior')).toBe('conv-1');
      expect(calcularSiguienteConversacionId(lista, 'conv-1', 'anterior')).toBe('conv-1');
    });
  });

  describe('CATALOGO_ATAJOS_BANDEJA', () => {
    it('incluye los atajos obligatorios j, k, r, c, s, ? y Escape con sus descripciones', () => {
      const teclas = CATALOGO_ATAJOS_BANDEJA.map((a) => a.tecla);
      expect(teclas).toContain('j');
      expect(teclas).toContain('k');
      expect(teclas).toContain('r');
      expect(teclas).toContain('c');
      expect(teclas).toContain('s');
      expect(teclas).toContain('?');
      expect(teclas).toContain('Escape');
    });
  });
});
